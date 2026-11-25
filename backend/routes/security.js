const router = require('express').Router();
const { Op } = require('sequelize');
const { SecurityEvent, User } = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');

const admins = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN')];

router.get('/admin/security-events', ...admins, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.type) where.type = String(req.query.type);
    if (req.query.severity) where.severity = String(req.query.severity);
    if (req.query.userId) {
      const userId = Number(req.query.userId);
      if (Number.isSafeInteger(userId) && userId > 0) where.userId = userId;
    }
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.createdAt[Op.lte] = new Date(req.query.to);
    }
    const result = await SecurityEvent.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'], required: false }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.set('Cache-Control', 'private, no-store');
    res.json({
      items: result.rows.map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        reason: event.reason,
        route: event.route,
        method: event.method,
        ip: event.ip,
        createdAt: event.createdAt,
        metadata: event.metadata,
        user: event.user ? {
          id: event.user.id,
          name: `${event.user.firstName} ${event.user.lastName}`.trim(),
          email: event.user.email
        } : null
      })),
      total: result.count,
      page,
      limit
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/security-events/summary', ...admins, async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [critical, high, total] = await Promise.all([
      SecurityEvent.count({ where: { severity: 'critical', createdAt: { [Op.gte]: since } } }),
      SecurityEvent.count({ where: { severity: 'high', createdAt: { [Op.gte]: since } } }),
      SecurityEvent.count({ where: { createdAt: { [Op.gte]: since } } })
    ]);
    res.json({ last24Hours: { critical, high, total } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
