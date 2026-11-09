const router = require('express').Router();
const sequelize = require('../config/database');
const { Clarification, Message, Tender, Offer, TenderInvitation, User } = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { requiredString, positiveNumber } = require('../utils/security');
const { recordAudit } = require('../utils/audit');
const { notifyUser, notifyOrganization } = require('../utils/notifications');

router.use(authenticate);

async function canViewTender(tender, user) {
  if (!tender) return false;
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role) || tender.buyerOrgId === user.organizationId) return true;
  if (user.role !== 'SELLER') return false;
  if (tender.visibility === 'PUBLIC' && tender.status !== 'DRAFT') return true;
  return Boolean(await TenderInvitation.findOne({
    where: { tenderId: tender.id, sellerOrgId: user.organizationId }
  }));
}

router.get('/tenders/:tenderId/clarifications', async (req, res, next) => {
  try {
    const tender = await Tender.findByPk(req.params.tenderId);
    if (!(await canViewTender(tender, req.user))) {
      return res.status(404).json({ message: 'Appel d’offres introuvable.' });
    }
    const clarifications = await Clarification.findAll({
      where: { tenderId: tender.id },
      order: [['createdAt', 'ASC']]
    });
    res.json(clarifications);
  } catch (error) {
    next(error);
  }
});

router.post('/tenders/:tenderId/clarifications', allowRoles('BUYER', 'SELLER'), async (req, res, next) => {
  try {
    const tender = await Tender.findByPk(req.params.tenderId);
    if (!(await canViewTender(tender, req.user)) || !['PUBLISHED', 'IN_NEGOTIATION'].includes(tender.status)) {
      return res.status(404).json({ message: 'Appel d’offres indisponible pour les questions.' });
    }
    const clarification = await Clarification.create({
      tenderId: tender.id,
      authorUserId: req.user.id,
      question: requiredString(req.body.question, 'Question', 5000)
    });
    await recordAudit(req, 'ASK_CLARIFICATION', 'Clarification', clarification.id);
    res.status(201).json(clarification);
  } catch (error) {
    next(error);
  }
});

router.post('/clarifications/:id/answer', allowRoles('BUYER'), async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const clarification = await Clarification.findByPk(req.params.id, {
      include: [{ model: Tender, as: 'tender' }],
      transaction
    });
    if (!clarification || clarification.tender.buyerOrgId !== req.user.organizationId) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Question introuvable.' });
    }
    clarification.answer = requiredString(req.body.answer, 'Réponse', 5000);
    clarification.answeredBy = req.user.id;
    clarification.answeredAt = new Date();
    await clarification.save({ transaction });
    const offers = await Offer.findAll({
      where: { tenderId: clarification.tenderId },
      attributes: ['sellerOrgId'],
      transaction
    });
    await Promise.all([...new Set(offers.map((offer) => offer.sellerOrgId))].map((organizationId) =>
      notifyOrganization(
        organizationId,
        'Nouvelle réponse à une clarification',
        `Une réponse a été publiée pour ${clarification.tender.reference}.`,
        `/seller/tenders/${clarification.tenderId}`,
        'info',
        transaction
      )
    ));
    await transaction.commit();
    await recordAudit(req, 'ANSWER_CLARIFICATION', 'Clarification', clarification.id);
    res.json(clarification);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.get('/offers/:offerId/messages', async (req, res, next) => {
  try {
    const offer = await Offer.findByPk(req.params.offerId, {
      include: [{ model: Tender, as: 'tender' }]
    });
    if (!offer || (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) &&
      offer.sellerOrgId !== req.user.organizationId &&
      offer.tender.buyerOrgId !== req.user.organizationId)) {
      return res.status(404).json({ message: 'Conversation introuvable.' });
    }
    const messages = await Message.findAll({
      where: { offerId: offer.id },
      order: [['createdAt', 'ASC']]
    });
    res.json(messages);
  } catch (error) {
    next(error);
  }
});

router.get('/offers/:offerId/participants', async (req, res, next) => {
  try {
    const offer = await Offer.findByPk(req.params.offerId, {
      include: [{ model: Tender, as: 'tender' }]
    });
    if (!offer || (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) &&
      offer.sellerOrgId !== req.user.organizationId &&
      offer.tender.buyerOrgId !== req.user.organizationId)) {
      return res.status(404).json({ message: 'Conversation introuvable.' });
    }
    const organizationId = req.user.role === 'SELLER' ? offer.tender.buyerOrgId : offer.sellerOrgId;
    const users = await User.findAll({
      where: { organizationId, status: 'ACTIVE' },
      attributes: ['id', 'firstName', 'lastName', 'role']
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.post('/offers/:offerId/messages', allowRoles('BUYER', 'SELLER'), async (req, res, next) => {
  let transaction;
  try {
    const offer = await Offer.findByPk(req.params.offerId, {
      include: [{ model: Tender, as: 'tender' }]
    });
    if (!offer) return res.status(404).json({ message: 'Offre introuvable.' });
    const isSeller = req.user.role === 'SELLER' && offer.sellerOrgId === req.user.organizationId;
    const isBuyer = req.user.role === 'BUYER' && offer.tender.buyerOrgId === req.user.organizationId;
    if (!isSeller && !isBuyer) return res.status(404).json({ message: 'Offre introuvable.' });
    if (!['SUBMITTED', 'SHORTLISTED', 'WON'].includes(offer.status)) {
      return res.status(409).json({ message: 'La négociation n’est pas ouverte pour cette offre.' });
    }
    const recipient = await User.findOne({
      where: {
        id: positiveNumber(req.body.recipientUserId, 'Destinataire', { integer: true }),
        organizationId: isSeller ? offer.tender.buyerOrgId : offer.sellerOrgId,
        status: 'ACTIVE'
      }
    });
    if (!recipient) return res.status(400).json({ message: 'Destinataire invalide.' });
    transaction = await sequelize.transaction();
    const message = await Message.create({
      tenderId: offer.tenderId,
      offerId: offer.id,
      senderUserId: req.user.id,
      recipientUserId: recipient.id,
      body: requiredString(req.body.body, 'Message', 5000)
    }, { transaction });
    await notifyUser(
      recipient.id,
      'Nouveau message de négociation',
      'Vous avez reçu un message privé concernant une offre.',
      `/workspace?offer=${offer.id}`,
      'info',
      transaction
    );
    await transaction.commit();
    await recordAudit(req, 'SEND_NEGOTIATION_MESSAGE', 'Message', message.id);
    res.status(201).json(message);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.patch('/messages/:id/read', async (req, res, next) => {
  try {
    const message = await Message.findOne({
      where: { id: positiveNumber(req.params.id, 'Message', { integer: true }), recipientUserId: req.user.id }
    });
    if (!message) return res.status(404).json({ message: 'Message introuvable.' });
    message.readAt = new Date();
    await message.save();
    res.json(message);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
