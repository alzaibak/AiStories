const router = require('express').Router();
const { User, Organization, Tender, Offer, PurchaseOrder, AuditLog } = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { recordAudit } = require('../utils/audit');

router.use(authenticate, allowRoles('ADMIN'));

router.get('/overview', async (req, res, next) => {
  try {
    const [users, organizations, pendingOrganizations, tenders, activeTenders, offers, orders] = await Promise.all([
      User.count(),
      Organization.count(),
      Organization.count({ where: { verificationStatus: 'PENDING' } }),
      Tender.count(),
      Tender.count({ where: { status: ['PUBLISHED', 'IN_NEGOTIATION'] } }),
      Offer.count(),
      PurchaseOrder.count()
    ]);
    res.json({ users, organizations, pendingOrganizations, tenders, activeTenders, offers, purchaseOrders: orders });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'status', 'organizationId', 'language', 'createdAt'],
      include: [{ model: Organization, as: 'organization', attributes: ['legalName', 'verificationStatus'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id/status', async (req, res, next) => {
  try {
    if (!['ACTIVE', 'SUSPENDED'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Statut de compte invalide.' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    if (user.id === req.user.id && req.body.status === 'SUSPENDED') {
      return res.status(409).json({ message: 'Un administrateur ne peut pas suspendre son propre compte.' });
    }
    user.status = req.body.status;
    await user.save();
    await recordAudit(req, 'UPDATE_USER_STATUS', 'User', user.id, { status: user.status });
    res.json({ id: user.id, status: user.status });
  } catch (error) {
    next(error);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const logs = await AuditLog.findAll({
      where: req.query.entityType ? { entityType: String(req.query.entityType).slice(0, 80) } : undefined,
      order: [['createdAt', 'DESC']],
      limit: Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
    });
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
