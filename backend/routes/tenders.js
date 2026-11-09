const router = require('express').Router();
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Tender, TenderItem, TenderInvitation, Offer, Organization, Category } = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { requiredString, positiveNumber } = require('../utils/security');
const { recordAudit } = require('../utils/audit');
const { notifyOrganization } = require('../utils/notifications');

router.use(authenticate);

async function findTenderForUser(id, user, transaction) {
  const tender = await Tender.findByPk(id, {
    include: [{ model: TenderItem, as: 'items' }, { model: Organization, as: 'buyerOrganization' }],
    transaction
  });
  if (!tender) return null;
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role) || tender.buyerOrgId === user.organizationId) return tender;
  if (user.role !== 'SELLER') return null;
  if (tender.status === 'DRAFT') return null;
  const isInvited = await TenderInvitation.findOne({
    where: { tenderId: tender.id, sellerOrgId: user.organizationId },
    transaction
  });
  if (tender.visibility === 'PUBLIC' && tender.status !== 'DRAFT') return tender;
  return isInvited ? tender : null;
}

router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === 'BUYER') where.buyerOrgId = req.user.organizationId;
    if (req.user.role === 'SELLER') {
      where.status = { [Op.in]: ['PUBLISHED', 'CLOSED', 'IN_NEGOTIATION', 'AWARDED'] };
      if (req.query.mine === 'true') {
        const offers = await Offer.findAll({ where: { sellerOrgId: req.user.organizationId }, attributes: ['tenderId'] });
        where.id = offers.map((offer) => offer.tenderId);
      }
    }
    if (req.query.status) {
      const allowedStatuses = ['DRAFT', 'PUBLISHED', 'CLOSED', 'IN_NEGOTIATION', 'AWARDED', 'CANCELLED'];
      if (!allowedStatuses.includes(req.query.status) ||
        req.user.role === 'SELLER' && req.query.status === 'DRAFT') {
        return res.status(400).json({ message: 'Filtre de statut invalide.' });
      }
      where.status = req.query.status;
    }
    if (req.query.search) where.title = { [Op.like]: `%${String(req.query.search).slice(0, 100)}%` };

    const tenders = await Tender.findAll({
      where,
      include: [
        { model: TenderItem, as: 'items' },
        { model: Organization, as: 'buyerOrganization', attributes: ['id', 'legalName', 'country'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    const visible = req.user.role === 'SELLER'
      ? await Promise.all(tenders.map(async (tender) => {
        if (tender.visibility === 'PUBLIC') return tender;
        const invitation = await TenderInvitation.findOne({
          where: { tenderId: tender.id, sellerOrgId: req.user.organizationId }
        });
        return invitation ? tender : null;
      })).then((items) => items.filter(Boolean))
      : tenders;
    res.json(visible);
  } catch (error) {
    next(error);
  }
});

router.post('/', allowRoles('BUYER'), async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const title = requiredString(req.body.title, 'Titre');
    const description = requiredString(req.body.description, 'Description', 10000);
    const deliveryCountry = requiredString(req.body.deliveryCountry, 'Pays de livraison', 120);
    const deadline = new Date(req.body.deadline);
    if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La date limite doit être future.' });
    }
    if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 500) {
      await transaction.rollback();
      return res.status(400).json({ message: 'L’appel d’offres doit contenir entre 1 et 500 lignes.' });
    }
    const organization = await Organization.findByPk(req.user.organizationId, { transaction });
    if (!organization || organization.type !== 'BUYER' || organization.verificationStatus !== 'APPROVED') {
      await transaction.rollback();
      return res.status(403).json({ message: 'Une organisation acheteuse vérifiée est requise.' });
    }
    const categoryId = req.body.categoryId ? positiveNumber(req.body.categoryId, 'Catégorie', { integer: true }) : null;
    if (categoryId && !(await Category.findByPk(categoryId, { transaction }))) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Catégorie introuvable.' });
    }
    const documentTypes = ['QUOTATION', 'COA', 'GMP', 'ORIGIN_CERTIFICATE', 'RCP', 'AMM', 'OTHER'];
    const requiredDocuments = req.body.requiredDocuments === undefined ? [] : req.body.requiredDocuments;
    const attachmentUrls = req.body.attachmentUrls === undefined ? [] : req.body.attachmentUrls;
    if (!Array.isArray(requiredDocuments) || requiredDocuments.some((type) => !documentTypes.includes(type))) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Liste de documents obligatoires invalide.' });
    }
    if (!Array.isArray(attachmentUrls) || attachmentUrls.some((url) => typeof url !== 'string' || !/^https?:\/\//i.test(url))) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Les pièces jointes doivent être des URL HTTP ou HTTPS.' });
    }
    if (req.body.type !== undefined && !['NORMAL', 'URGENT'].includes(req.body.type)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Type d’appel d’offres invalide.' });
    }
    if (req.body.visibility !== undefined && !['PUBLIC', 'INVITATION_ONLY'].includes(req.body.visibility)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Visibilité invalide.' });
    }
    if (req.body.sealedOffers !== undefined && typeof req.body.sealedOffers !== 'boolean') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Le paramètre des offres scellées doit être un booléen.' });
    }
    const referenceYear = new Date().getFullYear();
    const tempReference = `TND-${referenceYear}-TMP-${Date.now()}`;
    const tender = await Tender.create({
      reference: tempReference,
      buyerOrgId: organization.id,
      title,
      description,
      categoryId,
      deliveryCountry,
      deliveryRegion: req.body.deliveryRegion ? requiredString(req.body.deliveryRegion, 'Région', 180) : null,
      deadline,
      type: req.body.type === 'URGENT' ? 'URGENT' : 'NORMAL',
      visibility: req.body.visibility === 'INVITATION_ONLY' ? 'INVITATION_ONLY' : 'PUBLIC',
      sealedOffers: req.body.sealedOffers !== false,
      requiredDocuments,
      attachmentUrls,
      createdBy: req.user.id
    }, { transaction });

    for (const item of req.body.items) {
      await TenderItem.create({
        tenderId: tender.id,
        genericName: requiredString(item.genericName, 'DCI', 255),
        dosage: requiredString(item.dosage, 'Dosage', 120),
        dosageForm: requiredString(item.dosageForm, 'Forme galénique', 120),
        packaging: item.packaging ? requiredString(item.packaging, 'Conditionnement', 255) : null,
        quantity: positiveNumber(item.quantity, 'Quantité'),
        unit: requiredString(item.unit, 'Unité', 60),
        remarks: item.remarks ? String(item.remarks).slice(0, 2000) : null
      }, { transaction });
    }
    tender.reference = `TND-${referenceYear}-${String(tender.id).padStart(4, '0')}`;
    await tender.save({ transaction });
    await transaction.commit();
    await recordAudit(req, 'CREATE_TENDER', 'Tender', tender.id);
    res.status(201).json(await findTenderForUser(tender.id, req.user));
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.get('/:id/invitation-candidates', allowRoles('BUYER'), async (req, res, next) => {
  try {
    const tender = await Tender.findOne({
      where: { id: req.params.id, buyerOrgId: req.user.organizationId, visibility: 'INVITATION_ONLY' }
    });
    if (!tender) return res.status(404).json({ message: 'Appel privé introuvable.' });
    const sellers = await Organization.findAll({
      where: { type: 'SELLER', verificationStatus: 'APPROVED' },
      attributes: ['id', 'legalName', 'country', 'registrationNumber'],
      order: [['legalName', 'ASC']]
    });
    res.json(sellers);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const tender = await findTenderForUser(req.params.id, req.user);
    if (!tender) return res.status(404).json({ message: 'Appel d’offres introuvable.' });
    res.json(tender);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', allowRoles('BUYER'), async (req, res, next) => {
  try {
    const tender = await Tender.findOne({ where: { id: req.params.id, buyerOrgId: req.user.organizationId } });
    if (!tender) return res.status(404).json({ message: 'Appel d’offres introuvable.' });
    if (tender.status !== 'DRAFT') return res.status(409).json({ message: 'Seuls les appels d’offres brouillons peuvent être modifiés.' });
    for (const field of ['title', 'description', 'deliveryCountry', 'deliveryRegion']) {
      if (req.body[field] !== undefined) tender[field] = requiredString(req.body[field], field, field === 'description' ? 10000 : 255);
    }
    if (req.body.deadline !== undefined) {
      const deadline = new Date(req.body.deadline);
      if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) {
        return res.status(400).json({ message: 'La date limite doit être future.' });
      }
      tender.deadline = deadline;
    }
    await tender.save();
    await recordAudit(req, 'UPDATE_TENDER', 'Tender', tender.id);
    res.json(tender);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/items', allowRoles('BUYER'), async (req, res, next) => {
  try {
    const tender = await Tender.findOne({ where: { id: req.params.id, buyerOrgId: req.user.organizationId, status: 'DRAFT' } });
    if (!tender) return res.status(404).json({ message: 'Brouillon introuvable ou non modifiable.' });
    const item = await TenderItem.create({
      tenderId: tender.id,
      genericName: requiredString(req.body.genericName, 'DCI', 255),
      dosage: requiredString(req.body.dosage, 'Dosage', 120),
      dosageForm: requiredString(req.body.dosageForm, 'Forme galénique', 120),
      packaging: req.body.packaging || null,
      quantity: positiveNumber(req.body.quantity, 'Quantité'),
      unit: requiredString(req.body.unit, 'Unité', 60),
      remarks: req.body.remarks || null
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/publish', allowRoles('BUYER'), async (req, res, next) => {
  try {
    const tender = await Tender.findOne({
      where: { id: req.params.id, buyerOrgId: req.user.organizationId, status: 'DRAFT' },
      include: [{ model: TenderItem, as: 'items' }]
    });
    if (!tender) return res.status(404).json({ message: 'Brouillon introuvable.' });
    if (!tender.items.length) return res.status(400).json({ message: 'Ajoutez au moins une ligne avant publication.' });
    if (tender.deadline <= new Date()) return res.status(400).json({ message: 'La date limite doit être future.' });
    tender.status = 'PUBLISHED';
    tender.publishedAt = new Date();
    await tender.save();
    await recordAudit(req, 'PUBLISH_TENDER', 'Tender', tender.id);
    res.json(tender);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/invitations', allowRoles('BUYER'), async (req, res, next) => {
  let transaction;
  try {
    const tender = await Tender.findOne({ where: { id: req.params.id, buyerOrgId: req.user.organizationId } });
    if (!tender) return res.status(404).json({ message: 'Appel d’offres introuvable.' });
    if (tender.visibility !== 'INVITATION_ONLY') {
      return res.status(409).json({ message: 'Les invitations sont réservées aux appels à visibilité privée.' });
    }
    if (!['DRAFT', 'PUBLISHED'].includes(tender.status) || tender.deadline <= new Date()) {
      return res.status(409).json({ message: 'Les invitations ne sont plus disponibles pour cet appel.' });
    }
    if (!Array.isArray(req.body.sellerOrgIds) || req.body.sellerOrgIds.length === 0) {
      return res.status(400).json({ message: 'Sélectionnez au moins un vendeur à inviter.' });
    }
    const sellerIds = [...new Set(req.body.sellerOrgIds.map((id) => positiveNumber(id, 'Organisation vendeur', { integer: true })))];
    const sellers = await Organization.findAll({
      where: { id: sellerIds, type: 'SELLER', verificationStatus: 'APPROVED' }
    });
    if (sellers.length !== sellerIds.length) {
      return res.status(400).json({ message: 'Tous les vendeurs doivent être approuvés.' });
    }
    transaction = await sequelize.transaction();
    const invitations = await Promise.all(sellerIds.map((sellerOrgId) =>
      TenderInvitation.findOrCreate({
        where: { tenderId: tender.id, sellerOrgId },
        defaults: { tenderId: tender.id, sellerOrgId, status: 'INVITED' },
        transaction
      })
    ));
    await Promise.all(invitations.filter(([, created]) => created).map(([invitation]) =>
      notifyOrganization(
        invitation.sellerOrgId,
        'Nouvelle invitation à un appel d’offres',
        `Votre organisation est invitée à répondre à ${tender.reference} — ${tender.title}.`,
        `/seller/tenders/${tender.id}`,
        'info',
        transaction
      )
    ));
    await transaction.commit();
    res.status(201).json(invitations.map(([invitation]) => invitation));
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.post('/:id/close', allowRoles('BUYER'), async (req, res, next) => {
  try {
    const tender = await Tender.findOne({ where: { id: req.params.id, buyerOrgId: req.user.organizationId } });
    if (!tender) return res.status(404).json({ message: 'Appel d’offres introuvable.' });
    if (!['PUBLISHED', 'IN_NEGOTIATION'].includes(tender.status)) {
      return res.status(409).json({ message: 'Cet appel d’offres ne peut pas être clôturé.' });
    }
    tender.status = 'CLOSED';
    await tender.save();
    await recordAudit(req, 'CLOSE_TENDER', 'Tender', tender.id);
    res.json(tender);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
