/* Download quotas for purchased e-books. Rentals and subscription access stay unlimited. */
const { Op } = require('sequelize');
const { Entitlement, sequelize } = require('../models');

/** Pure quota maths, unit-testable without a database. */
function quotaState(limit, count) {
  const used = Math.max(0, Math.floor(Number(count) || 0));
  if (limit === null || limit === undefined) {
    return { unlimited: true, allowed: true, used, remaining: null };
  }
  const normalized = Math.max(0, Math.floor(Number(limit) || 0));
  const remaining = Math.max(0, normalized - used);
  return { unlimited: false, allowed: remaining > 0, used, remaining };
}

function activeEntitlementWhere(userId, bookId, now = new Date()) {
  return {
    userId,
    resourceId: bookId,
    resourceType: { [Op.in]: ['book', 'ebook'] },
    revokedAt: null,
    startsAt: { [Op.lte]: now },
    [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }]
  };
}

async function findActiveEntitlement(userId, bookId, transaction = null) {
  return Entitlement.findOne({
    where: activeEntitlementWhere(userId, bookId),
    order: [['id', 'DESC']],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
}

async function downloadQuota(userId, bookId) {
  const entitlement = await findActiveEntitlement(userId, bookId);
  if (!entitlement) return { entitlement: null, ...quotaState(null, 0) };
  return {
    entitlement,
    ...quotaState(entitlement.downloadLimit, entitlement.downloadCount)
  };
}

/**
 * Consumes one download from the quota. Returns `{ allowed: false }` when the
 * entitlement is exhausted, so the route can answer 409 without touching Stripe
 * or the file storage.
 */
async function consumeDownload(userId, bookId) {
  const transaction = await sequelize.transaction();
  try {
    const entitlement = await findActiveEntitlement(userId, bookId, transaction);
    if (!entitlement) {
      await transaction.commit();
      return { allowed: true, unlimited: true, remaining: null };
    }
    const state = quotaState(entitlement.downloadLimit, entitlement.downloadCount);
    if (!state.allowed) {
      await transaction.commit();
      return { allowed: false, unlimited: false, remaining: 0, code: 'DOWNLOAD_LIMIT_REACHED' };
    }
    const nextCount = state.used + 1;
    await entitlement.update({ downloadCount: nextCount }, { transaction });
    await transaction.commit();
    return {
      allowed: true,
      unlimited: state.unlimited,
      remaining: state.unlimited ? null : Math.max(0, Number(entitlement.downloadLimit) - nextCount)
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

module.exports = {
  quotaState,
  findActiveEntitlement,
  downloadQuota,
  consumeDownload
};
