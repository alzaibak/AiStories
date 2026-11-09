const { AuditLog } = require('../models');

async function recordAudit(req, action, entityType, entityId, metadata = {}) {
  const user = req.user || req.actor || null;
  await AuditLog.create({
    userId: user ? user.id : null,
    organizationId: user ? user.organizationId : null,
    action,
    entityType,
    entityId: entityId == null ? null : String(entityId),
    ipAddress: req.ip,
    metadata
  });
}

module.exports = { recordAudit };
