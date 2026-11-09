const router = require('express').Router();
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Offer, OfferItem, Tender, TenderItem, TenderInvitation, Organization, Product, Document, PurchaseOrder } = require('../models');
const { authenticate, allowRoles, requireApprovedSeller } = require('../middleware/authorization');
const { positiveNumber, requiredString } = require('../utils/security');
const { recordAudit } = require('../utils/audit');
const { notifyOrganization } = require('../utils/notifications');
const { canBuyerViewOffers } = require('../utils/tendering');

router.use(authenticate);

async function loadOffer(id) {
  return Offer.findByPk(id, {
    include: [
      { model: OfferItem, as: 'items', include: [
        { model: TenderItem, as: 'tenderItem' },
        { model: Product, as: 'product' }
      ] },
      { model: Tender, as: 'tender' },
      { model: Organization, as: 'sellerOrganization', attributes: ['id', 'legalName', 'country', 'verificationStatus'] }
    ]
  });
}

function ownsOrAdmin(offer, user) {
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  if (user.role === 'SELLER') return offer.sellerOrgId === user.organizationId;
  return user.role === 'BUYER' &&
    offer.tender.buyerOrgId === user.organizationId &&
    canBuyerViewOffers(offer.tender);
}

async function validateForSubmission(offer, transaction) {
  if (offer.status !== 'DRAFT') {
    const error = new Error('Seul un brouillon peut être soumis.');
    error.status = 409;
    throw error;
  }
  const tender = await Tender.findByPk(offer.tenderId, {
    include: [{ model: TenderItem, as: 'items' }],
    transaction
  });
  if (!tender || tender.status !== 'PUBLISHED' || tender.deadline <= new Date()) {
    const error = new Error('Cet appel d’offres n’accepte plus de réponses.');
    error.status = 409;
    throw error;
  }
  if (offer.items.length !== tender.items.length ||
    tender.items.some((tenderItem) => !offer.items.some((item) => item.tenderItemId === tenderItem.id))) {
    const error = new Error('Une offre doit répondre à chaque ligne de l’appel d’offres.');
    error.status = 400;
    throw error;
  }
  for (const item of offer.items) {
    if (Number(item.moq) > Number(item.tenderItem.quantity) ||
      Number(item.availableQuantity) < Number(item.tenderItem.quantity)) {
      const error = new Error(`Quantité minimale ou disponible insuffisante pour ${item.tenderItem.genericName}.`);
      error.status = 400;
      throw error;
    }
  }
  const requiredTypes = Array.isArray(tender.requiredDocuments) ? tender.requiredDocuments : [];
  if (requiredTypes.length) {
    const documents = await Document.findAll({
      where: { offerId: offer.id, ownerOrgId: offer.sellerOrgId, verificationStatus: 'APPROVED' },
      transaction
    });
    const attachedTypes = new Set(documents.map((document) => document.type));
    const missing = requiredTypes.filter((type) => !attachedTypes.has(type));
    if (missing.length) {
      const error = new Error(`Documents obligatoires manquants ou non approuvés : ${missing.join(', ')}.`);
      error.status = 400;
      throw error;
    }
  }
  offer.status = 'SUBMITTED';
  offer.submittedAt = new Date();
  await offer.save({ transaction });
  return offer;
}

router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === 'SELLER') where.sellerOrgId = req.user.organizationId;
    if (req.user.role === 'BUYER') {
      const buyerTenders = await Tender.findAll({
        where: {
          buyerOrgId: req.user.organizationId,
          [Op.or]: [
            { sealedOffers: false },
            { deadline: { [Op.lte]: new Date() } }
          ]
        },
        attributes: ['id']
      });
      where.tenderId = buyerTenders.map((tender) => tender.id);
    }
    const offers = await Offer.findAll({
      where,
      include: [
        { model: OfferItem, as: 'items', include: [{ model: TenderItem, as: 'tenderItem' }] },
        { model: Tender, as: 'tender', attributes: ['id', 'reference', 'title', 'buyerOrgId', 'status', 'deadline'] },
        { model: Organization, as: 'sellerOrganization', attributes: ['id', 'legalName', 'country'] }
      ],
      order: [['updatedAt', 'DESC']]
    });
    res.json(offers);
  } catch (error) {
    next(error);
  }
});

router.post('/', allowRoles('SELLER'), requireApprovedSeller, async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const tender = await Tender.findByPk(positiveNumber(req.body.tenderId, 'Appel d’offres', { integer: true }), { transaction });
    if (!tender || tender.status !== 'PUBLISHED' || tender.deadline <= new Date()) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Appel d’offres non disponible.' });
    }
    if (tender.visibility === 'INVITATION_ONLY') {
      const invitation = await TenderInvitation.findOne({
        where: { tenderId: tender.id, sellerOrgId: req.user.organizationId },
        transaction
      });
      if (!invitation) {
        await transaction.rollback();
        return res.status(403).json({ message: 'Votre organisation n’a pas été invitée.' });
      }
    }
    const tenderItems = await TenderItem.findAll({ where: { tenderId: tender.id }, transaction });
    if (!Array.isArray(req.body.items) || req.body.items.length !== tenderItems.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Une offre doit inclure toutes les lignes demandées.' });
    }
    const tenderItemIds = new Set(tenderItems.map((item) => item.id));
    const suppliedIds = req.body.items.map((item) => positiveNumber(item.tenderItemId, 'Ligne d’appel d’offres', { integer: true }));
    if (new Set(suppliedIds).size !== suppliedIds.length || suppliedIds.some((id) => !tenderItemIds.has(id))) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Les lignes de l’offre sont invalides ou en doublon.' });
    }

    const offer = await Offer.create({
      tenderId: tender.id,
      sellerOrgId: req.user.organizationId,
      currency: /^[A-Z]{3}$/.test(req.body.currency || '') ? req.body.currency : 'EUR',
      deliveryDays: positiveNumber(req.body.deliveryDays, 'Délai de livraison', { integer: true }),
      validityDays: positiveNumber(req.body.validityDays, 'Validité de l’offre', { integer: true }),
      incoterm: req.body.incoterm,
      paymentTerms: requiredString(req.body.paymentTerms, 'Conditions de paiement', 255),
      comment: req.body.comment ? String(req.body.comment).slice(0, 5000) : null,
      totalAmount: 0
    }, { transaction });
    let totalAmount = 0;
    for (const input of req.body.items) {
      const tenderItem = tenderItems.find((item) => item.id === Number(input.tenderItemId));
      const unitPrice = positiveNumber(input.unitPrice, 'Prix unitaire', { allowZero: false });
      const moq = positiveNumber(input.moq, 'MOQ');
      const availableQuantity = positiveNumber(input.availableQuantity, 'Quantité disponible');
      let productId = null;
      if (input.productId) {
        const product = await Product.findOne({
          where: { id: positiveNumber(input.productId, 'Produit', { integer: true }), sellerOrgId: req.user.organizationId },
          transaction
        });
        if (!product) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Un produit sélectionné ne vous appartient pas.' });
        }
        productId = product.id;
      }
      const lineTotal = Number((unitPrice * Number(tenderItem.quantity)).toFixed(2));
      totalAmount += lineTotal;
      await OfferItem.create({
        offerId: offer.id,
        tenderItemId: tenderItem.id,
        productId,
        unitPrice,
        moq,
        availableQuantity,
        lineTotal,
        batchNumber: input.batchNumber ? String(input.batchNumber).slice(0, 120) : null,
        expiryDate: input.expiryDate || null
      }, { transaction });
    }
    offer.totalAmount = totalAmount.toFixed(2);
    await offer.save({ transaction });
    if (req.body.submitNow === true) {
      offer.items = await OfferItem.findAll({ where: { offerId: offer.id }, include: [{ model: TenderItem, as: 'tenderItem' }], transaction });
      await validateForSubmission(offer, transaction);
      await TenderInvitation.update(
        { status: 'RESPONDED' },
        { where: { tenderId: tender.id, sellerOrgId: req.user.organizationId }, transaction }
      );
      await notifyOrganization(
        tender.buyerOrgId,
        'Nouvelle offre reçue',
        `Une offre a été soumise pour ${tender.reference} — ${tender.title}.`,
        `/buyer/tenders/${tender.id}/offers`,
        'info',
        transaction
      );
    }
    await transaction.commit();
    await recordAudit(req, req.body.submitNow === true ? 'SUBMIT_OFFER' : 'CREATE_OFFER', 'Offer', offer.id);
    res.status(201).json(await loadOffer(offer.id));
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const offer = await loadOffer(req.params.id);
    if (!offer || !ownsOrAdmin(offer, req.user)) {
      return res.status(404).json({ message: 'Offre introuvable.' });
    }
    res.json(offer);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/submit', allowRoles('SELLER'), requireApprovedSeller, async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const offer = await Offer.findOne({
      where: { id: req.params.id, sellerOrgId: req.user.organizationId },
      include: [{ model: OfferItem, as: 'items', include: [{ model: TenderItem, as: 'tenderItem' }] }],
      transaction
    });
    if (!offer) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Brouillon introuvable.' });
    }
    await validateForSubmission(offer, transaction);
    await TenderInvitation.update(
      { status: 'RESPONDED' },
      { where: { tenderId: offer.tenderId, sellerOrgId: req.user.organizationId }, transaction }
    );
    const tender = await Tender.findByPk(offer.tenderId, { transaction });
    await notifyOrganization(
      tender.buyerOrgId,
      'Nouvelle offre reçue',
      `Une offre a été soumise pour ${tender.reference} — ${tender.title}.`,
      `/buyer/tenders/${tender.id}/offers`,
      'info',
      transaction
    );
    await transaction.commit();
    await recordAudit(req, 'SUBMIT_OFFER', 'Offer', offer.id);
    res.json(await loadOffer(offer.id));
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.patch('/:id/status', allowRoles('BUYER'), async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const offer = await Offer.findByPk(req.params.id, {
      include: [{ model: Tender, as: 'tender' }],
      transaction
    });
    if (!offer || offer.tender.buyerOrgId !== req.user.organizationId) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Offre introuvable.' });
    }
    if (!canBuyerViewOffers(offer.tender)) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Les offres de cet appel restent scellées jusqu’à la date limite.' });
    }
    const status = req.body.status;
    if (!['SHORTLISTED', 'REJECTED', 'WON'].includes(status) || offer.status !== 'SUBMITTED' && offer.status !== 'SHORTLISTED') {
      await transaction.rollback();
      return res.status(409).json({ message: 'Transition de statut invalide.' });
    }
    if (status === 'WON') {
      const lockedTender = await Tender.findByPk(offer.tenderId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!lockedTender || lockedTender.status === 'AWARDED') {
        await transaction.rollback();
        return res.status(409).json({ message: 'Un fournisseur a déjà remporté cet appel d’offres.' });
      }
      offer.status = 'WON';
      lockedTender.status = 'AWARDED';
      await lockedTender.save({ transaction });
      offer.tender.status = 'AWARDED';
      await Offer.update(
        { status: 'REJECTED' },
        { where: { tenderId: offer.tenderId, id: { [Op.ne]: offer.id }, status: ['SUBMITTED', 'SHORTLISTED'] }, transaction }
      );
      await PurchaseOrder.findOrCreate({
        where: { offerId: offer.id },
        defaults: {
          tenderId: offer.tenderId,
          offerId: offer.id,
          number: `PO-${offer.tender.reference}-${offer.id}`,
          status: 'ISSUED',
          amount: offer.totalAmount,
          currency: offer.currency,
          terms: { incoterm: offer.incoterm, paymentTerms: offer.paymentTerms },
          createdBy: req.user.id
        },
        transaction
      });
    } else {
      offer.status = status;
      if (status === 'SHORTLISTED') {
        offer.tender.status = 'IN_NEGOTIATION';
        await offer.tender.save({ transaction });
      }
    }
    await offer.save({ transaction });
    if (status === 'WON') {
      await notifyOrganization(
        offer.sellerOrgId,
        'Votre offre a été retenue',
        `Votre offre pour ${offer.tender.reference} a été attribuée. Un bon de commande est disponible.`,
        '/seller/orders',
        'success',
        transaction
      );
    } else {
      await notifyOrganization(
        offer.sellerOrgId,
        status === 'SHORTLISTED' ? 'Offre présélectionnée' : 'Mise à jour de votre offre',
        `Le statut de votre offre pour ${offer.tender.reference} est : ${status}.`,
        '/seller/offers',
        'info',
        transaction
      );
    }
    await transaction.commit();
    await recordAudit(req, `OFFER_${status}`, 'Offer', offer.id);
    res.json(await loadOffer(offer.id));
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

module.exports = router;
