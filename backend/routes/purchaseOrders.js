const router = require('express').Router();
const sequelize = require('../config/database');
const { PurchaseOrder, Offer, Tender } = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { recordAudit } = require('../utils/audit');
const { notifyOrganization } = require('../utils/notifications');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const orders = await PurchaseOrder.findAll({
      include: [
        { model: Offer, as: 'offer', attributes: ['id', 'sellerOrgId', 'currency'] },
        { model: Tender, as: 'tender', attributes: ['id', 'reference', 'title', 'buyerOrgId'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(orders.filter((order) => ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) ||
      order.tender.buyerOrgId === req.user.organizationId ||
      order.offer.sellerOrgId === req.user.organizationId));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', allowRoles('BUYER', 'SELLER', 'ADMIN'), async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const purchaseOrder = await PurchaseOrder.findByPk(req.params.id, {
      include: [
        { model: Offer, as: 'offer' },
        { model: Tender, as: 'tender' }
      ],
      transaction
    });
    if (!purchaseOrder) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Bon de commande introuvable.' });
    }
    const isBuyer = req.user.role === 'BUYER' && purchaseOrder.tender.buyerOrgId === req.user.organizationId;
    const isSeller = req.user.role === 'SELLER' && purchaseOrder.offer.sellerOrgId === req.user.organizationId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    if (!isBuyer && !isSeller && !isAdmin) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Bon de commande introuvable.' });
    }

    const allowedTransitions = {
      ISSUED: isSeller ? ['ACKNOWLEDGED'] : [],
      ACKNOWLEDGED: isBuyer ? ['FULFILLED', 'CANCELLED'] : [],
      FULFILLED: [],
      CANCELLED: [],
      DRAFT: isBuyer ? ['ISSUED', 'CANCELLED'] : []
    };
    if (isAdmin && ['ISSUED', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED'].includes(req.body.status)) {
      purchaseOrder.status = req.body.status;
    } else if ((allowedTransitions[purchaseOrder.status] || []).includes(req.body.status)) {
      purchaseOrder.status = req.body.status;
    } else {
      await transaction.rollback();
      return res.status(409).json({ message: 'Transition de statut non autorisée.' });
    }
    await purchaseOrder.save({ transaction });
    const notifyOrganizationId = isSeller ? purchaseOrder.tender.buyerOrgId : purchaseOrder.offer.sellerOrgId;
    await notifyOrganization(
      notifyOrganizationId,
      'Mise à jour du bon de commande',
      `${purchaseOrder.number} est maintenant au statut ${purchaseOrder.status}.`,
      '/workspace?tab=orders',
      'info',
      transaction
    );
    await transaction.commit();
    await recordAudit(req, 'UPDATE_PURCHASE_ORDER', 'PurchaseOrder', purchaseOrder.id, { status: purchaseOrder.status });
    res.json(purchaseOrder);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

module.exports = router;
