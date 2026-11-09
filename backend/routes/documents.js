const router = require('express').Router();
const sequelize = require('../config/database');
const { Document, Offer, Tender, Product, TenderInvitation } = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { positiveNumber, requiredString } = require('../utils/security');
const { canBuyerViewOffers } = require('../utils/tendering');
const {
  MAX_DOCUMENT_BYTES,
  SIGNED_URL_TTL_SECONDS,
  createDocumentKey,
  createUploadKey,
  createUploadForm,
  getDocumentMetadata,
  promoteUploadedDocument,
  deleteDocumentObject,
  createDownloadUrl
} = require('../utils/documentStorage');
const { recordAudit } = require('../utils/audit');
const { notifyOrganization } = require('../utils/notifications');

const documentTypes = ['QUOTATION', 'COA', 'GMP', 'ORIGIN_CERTIFICATE', 'RCP', 'AMM', 'OTHER'];
const allowedFileTypes = {
  '.pdf': ['application/pdf'],
  '.zip': ['application/zip', 'application/x-zip-compressed']
};

router.use(authenticate);

function publicDocument(document) {
  const result = document.toJSON();
  delete result.storageKey;
  delete result.fileUrl;
  return result;
}

async function canReadDocument(document, user) {
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role) || document.ownerOrgId === user.organizationId) return true;
  if (user.role !== 'BUYER' || document.verificationStatus !== 'APPROVED') return false;

  if (document.offerId) {
    const offer = await Offer.findByPk(document.offerId, {
      include: [{ model: Tender, as: 'tender' }]
    });
    return Boolean(
      offer &&
      offer.tender &&
      offer.tender.buyerOrgId === user.organizationId &&
      canBuyerViewOffers(offer.tender)
    );
  }
  if (document.tenderId) {
    const tender = await Tender.findByPk(document.tenderId);
    return Boolean(tender && tender.buyerOrgId === user.organizationId && tender.status !== 'DRAFT');
  }
  return false;
}

async function findUploadContext(req, ownerOrgId) {
  let offerId = null;
  let productId = null;
  let tenderId = null;

  if (req.body.offerId) {
    const offer = await Offer.findByPk(positiveNumber(req.body.offerId, 'Offre', { integer: true }));
    if (!offer || offer.sellerOrgId !== ownerOrgId) return { error: 'Offre introuvable dans votre organisation.' };
    offerId = offer.id;
    tenderId = offer.tenderId;
  }
  if (req.body.productId) {
    const product = await Product.findOne({
      where: {
        id: positiveNumber(req.body.productId, 'Produit', { integer: true }),
        sellerOrgId: ownerOrgId
      }
    });
    if (!product) return { error: 'Produit introuvable dans votre organisation.' };
    productId = product.id;
  }
  if (!offerId && !productId && req.body.tenderId) {
    const tender = await Tender.findByPk(positiveNumber(req.body.tenderId, 'Appel d’offres', { integer: true }));
    if (!tender || (req.user.role === 'BUYER' && tender.buyerOrgId !== ownerOrgId)) {
      return { error: 'Appel d’offres introuvable.' };
    }
    if (req.user.role === 'SELLER') {
      const publicTender = tender.visibility === 'PUBLIC' && tender.status !== 'DRAFT';
      const invited = publicTender || Boolean(await TenderInvitation.findOne({
        where: { tenderId: tender.id, sellerOrgId: ownerOrgId }
      }));
      if (!invited) return { error: 'Appel d’offres introuvable.' };
    }
    tenderId = tender.id;
  }
  return { offerId, productId, tenderId };
}

router.get('/', async (req, res, next) => {
  try {
    const documents = await Document.findAll({
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    const visible = await Promise.all(documents.map(async (document) =>
      await canReadDocument(document, req.user) ? publicDocument(document) : null
    ));
    res.json(visible.filter(Boolean));
  } catch (error) {
    next(error);
  }
});

router.post('/upload-url', allowRoles('SELLER', 'BUYER'), async (req, res, next) => {
  try {
    const ownerOrgId = req.user.organizationId;
    if (!ownerOrgId) return res.status(403).json({ message: 'Un compte rattaché à une organisation est requis.' });

    const type = requiredString(req.body.type, 'Type de document', 40);
    if (!documentTypes.includes(type)) return res.status(400).json({ message: 'Type de document invalide.' });

    const fileName = requiredString(req.body.fileName, 'Nom du fichier', 255);
    if (/[\\/\\\u0000-\u001f]/.test(fileName)) {
      return res.status(400).json({ message: 'Le nom de fichier ne doit pas contenir de chemin ni de caractère de contrôle.' });
    }
    const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    const requestedMimeType = requiredString(req.body.mimeType, 'Type MIME', 150).toLowerCase();
    if (!allowedFileTypes[extension]?.includes(requestedMimeType)) {
      return res.status(400).json({ message: 'Seuls les fichiers PDF et ZIP avec un type MIME cohérent sont acceptés.' });
    }
    const mimeType = extension === '.zip' ? 'application/zip' : requestedMimeType;
    const fileSize = positiveNumber(req.body.fileSize, 'Taille du fichier', { integer: true });
    if (fileSize > MAX_DOCUMENT_BYTES) {
      return res.status(413).json({ message: 'La taille maximale d’un document est de 20 Mo.' });
    }
    if (req.body.expiresAt) {
      const expiry = new Date(`${req.body.expiresAt}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.expiresAt) ||
        Number.isNaN(expiry.getTime()) ||
        expiry.toISOString().slice(0, 10) !== req.body.expiresAt) {
        return res.status(400).json({ message: 'La date d’expiration doit être une date valide au format AAAA-MM-JJ.' });
      }
    }

    const context = await findUploadContext(req, ownerOrgId);
    if (context.error) return res.status(404).json({ message: context.error });

    const uploadKey = createUploadKey(ownerOrgId);
    const upload = await createUploadForm({ key: uploadKey, mimeType });
    const document = await Document.create({
      ownerOrgId,
      ...context,
      type,
      fileName,
      fileUrl: null,
      storageKey: uploadKey,
      fileSize,
      mimeType,
      expiresAt: req.body.expiresAt || null,
      verificationStatus: 'PENDING'
    });
    await recordAudit(req, 'CREATE_PRIVATE_DOCUMENT_UPLOAD', 'Document', document.id);
    res.status(201).json({
      document: publicDocument(document),
      upload: { url: upload.url, fields: upload.fields, expiresIn: SIGNED_URL_TTL_SECONDS }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/complete', allowRoles('SELLER', 'BUYER'), async (req, res, next) => {
  try {
    const document = await Document.findByPk(positiveNumber(req.params.id, 'Document', { integer: true }));
    if (!document || document.ownerOrgId !== req.user.organizationId) {
      return res.status(404).json({ message: 'Document introuvable dans votre organisation.' });
    }
    if (document.uploadedAt) return res.json(publicDocument(document));
    if (!document.storageKey) return res.status(409).json({ message: 'Ce document ne possède pas de stockage privé.' });

    let metadata;
    try {
      metadata = await getDocumentMetadata(document.storageKey);
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(409).json({ message: 'Le fichier doit être téléversé avant de finaliser le document.' });
      }
      throw error;
    }
    const actualSize = Number(metadata.ContentLength);
    const validUpload = Number.isSafeInteger(actualSize) &&
      actualSize > 0 &&
      actualSize <= MAX_DOCUMENT_BYTES &&
      actualSize === Number(document.fileSize) &&
      metadata.ContentType === document.mimeType;
    if (!validUpload) {
      await deleteDocumentObject(document.storageKey);
      await document.destroy();
      return res.status(400).json({ message: 'Le fichier téléversé ne correspond pas aux métadonnées autorisées.' });
    }
    if (!metadata.ETag) throw new Error('Le stockage privé n’a pas fourni de signature ETag pour le fichier.');

    const uploadedKey = document.storageKey;
    const privateKey = createDocumentKey(document.ownerOrgId);
    await promoteUploadedDocument({
      sourceKey: uploadedKey,
      destinationKey: privateKey,
      etag: metadata.ETag
    });
    document.storageKey = privateKey;
    document.uploadedAt = new Date();
    document.fileSize = actualSize;
    await document.save();
    try {
      await deleteDocumentObject(uploadedKey);
    } catch (error) {
      console.error('Impossible de supprimer le fichier temporaire après finalisation :', error);
    }
    await recordAudit(req, 'COMPLETE_PRIVATE_DOCUMENT_UPLOAD', 'Document', document.id);
    res.json(publicDocument(document));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/download-url', async (req, res, next) => {
  try {
    const document = await Document.findByPk(positiveNumber(req.params.id, 'Document', { integer: true }));
    if (!document || !(await canReadDocument(document, req.user))) {
      return res.status(404).json({ message: 'Document introuvable.' });
    }
    if (!document.storageKey || !document.uploadedAt) {
      return res.status(409).json({ message: 'Ce document doit être téléversé à nouveau dans le stockage privé.' });
    }
    const downloadUrl = await createDownloadUrl({
      key: document.storageKey,
      fileName: document.fileName,
      mimeType: document.mimeType
    });
    await recordAudit(req, 'ACCESS_PRIVATE_DOCUMENT', 'Document', document.id);
    res.json({ downloadUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', allowRoles('SELLER', 'BUYER', 'ADMIN'), async (req, res, next) => {
  try {
    const document = await Document.findByPk(positiveNumber(req.params.id, 'Document', { integer: true }));
    if (!document || (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) &&
      document.ownerOrgId !== req.user.organizationId)) {
      return res.status(404).json({ message: 'Document introuvable.' });
    }
    if (document.storageKey) await deleteDocumentObject(document.storageKey);
    await document.destroy();
    await recordAudit(req, 'DELETE_PRIVATE_DOCUMENT', 'Document', document.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/verification', allowRoles('ADMIN'), async (req, res, next) => {
  let transaction;
  try {
    if (!['APPROVED', 'REJECTED', 'EXPIRED', 'PENDING'].includes(req.body.verificationStatus)) {
      return res.status(400).json({ message: 'Statut de vérification invalide.' });
    }
    transaction = await sequelize.transaction();
    const document = await Document.findByPk(req.params.id, { transaction });
    if (!document) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document introuvable.' });
    }
    if (req.body.verificationStatus === 'APPROVED' && !document.uploadedAt) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Un document doit être téléversé et vérifié avant son approbation.' });
    }
    document.verificationStatus = req.body.verificationStatus;
    await document.save({ transaction });
    await notifyOrganization(
      document.ownerOrgId,
      'Vérification d’un document',
      `${document.fileName} : ${document.verificationStatus}.`,
      '/workspace?tab=documents',
      document.verificationStatus === 'APPROVED' ? 'success' : 'warning',
      transaction
    );
    await transaction.commit();
    await recordAudit(req, 'VERIFY_DOCUMENT', 'Document', document.id, { verificationStatus: document.verificationStatus });
    res.json(publicDocument(document));
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

module.exports = router;
