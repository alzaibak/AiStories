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

/**
 * Duplicate entitlement rows can exist for one reader and one book (an old
 * purchase plus a re-grant). The strictest row wins, so a fresh duplicate can
 * never hand out a download the reader already used.
 */
function pickMostRestrictive(rows) {
  if (!rows.length) return null;
  const limited = rows.filter((row) => row.downloadLimit !== null && row.downloadLimit !== undefined);
  if (!limited.length) return rows[0];
  return [...limited].sort((a, b) => {
    const remainingA = Number(a.downloadLimit) - Number(a.downloadCount || 0);
    const remainingB = Number(b.downloadLimit) - Number(b.downloadCount || 0);
    return remainingA - remainingB || Number(a.id) - Number(b.id);
  })[0];
}

/**
 * After a re-buy a reader can own the same book twice (one exhausted right and
 * one fresh one). The download must use the right that still has downloads left,
 * never the exhausted duplicate; the strictest row is only a last resort.
 */
function pickDownloadable(rows) {
  if (!rows.length) return null;
  const allowed = rows.filter((row) => quotaState(row.downloadLimit, row.downloadCount).allowed);
  if (!allowed.length) return pickMostRestrictive(rows);
  return [...allowed].sort((a, b) => Number(b.id) - Number(a.id))[0];
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
  const rows = await Entitlement.findAll({
    where: activeEntitlementWhere(userId, bookId),
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  return pickMostRestrictive(rows);
}

/** The active right that still allows a download (falls back to the strictest). */
async function findDownloadableEntitlement(userId, bookId, transaction = null) {
  const rows = await Entitlement.findAll({
    where: activeEntitlementWhere(userId, bookId),
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  return pickDownloadable(rows);
}

async function downloadQuota(userId, bookId) {
  const entitlement = await findDownloadableEntitlement(userId, bookId);
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
    const entitlement = await findDownloadableEntitlement(userId, bookId, transaction);
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
      entitlementId: entitlement.id,
      contentLanguage: entitlement.contentLanguage || null,
      remaining: state.unlimited ? null : Math.max(0, Number(entitlement.downloadLimit) - nextCount)
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

/**
 * Gives the attempt back when the transfer never completed (aborted download,
 * network error). This is the reader's second chance: one successful download
 * is final, a failed one does not cost the quota.
 */
async function releaseDownload(entitlementId) {
  if (!entitlementId) return;
  const entitlement = await Entitlement.findByPk(entitlementId);
  if (!entitlement) return;
  const used = Math.max(0, Number(entitlement.downloadCount) || 0);
  if (used === 0) return;
  await entitlement.update({ downloadCount: used - 1 });
}

module.exports = {
  quotaState,
  pickMostRestrictive,
  pickDownloadable,
  findActiveEntitlement,
  findDownloadableEntitlement,
  downloadQuota,
  consumeDownload,
  releaseDownload
};
