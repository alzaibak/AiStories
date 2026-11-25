const crypto = require('crypto');
const { DownloadToken, Entitlement, sequelize } = require('../models');

const TOKEN_TTL_SECONDS = 300;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function createDownloadToken({ userId, entitlementId, bookId, ttlSeconds = TOKEN_TTL_SECONDS }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + Math.max(30, Math.min(900, Number(ttlSeconds) || TOKEN_TTL_SECONDS)) * 1000);
  await DownloadToken.create({
    tokenHash: hashToken(token),
    userId,
    entitlementId,
    bookId,
    expiresAt
  });
  return { token, expiresAt, expiresInSeconds: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) };
}

/**
 * Consumes a token atomically. A token is single-use even when two requests
 * arrive at the same time because the row is locked before `usedAt` is set.
 */
async function consumeDownloadToken(token, userId = null) {
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const transaction = await sequelize.transaction();
  try {
    const record = await DownloadToken.findOne({
      where: { tokenHash: hashToken(token) },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!record || (userId !== null && record.userId !== userId) || record.usedAt || record.expiresAt <= new Date()) {
      await transaction.rollback();
      return null;
    }
    const entitlement = await Entitlement.findOne({
      where: { id: record.entitlementId, userId: record.userId, revokedAt: null },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!entitlement) {
      await transaction.rollback();
      return null;
    }
    if (entitlement.expiresAt && entitlement.expiresAt <= new Date()) {
      await transaction.rollback();
      return null;
    }
    const limit = entitlement.downloadLimit;
    const used = Number(entitlement.downloadCount) || 0;
    if (limit !== null && limit !== undefined && used >= Number(limit)) {
      await transaction.rollback();
      return { exhausted: true, entitlement };
    }
    await record.update({ usedAt: new Date() }, { transaction });
    await entitlement.update({ downloadCount: used + 1 }, { transaction });
    await transaction.commit();
    return { entitlement, bookId: record.bookId, userId: record.userId };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

module.exports = { hashToken, createDownloadToken, consumeDownloadToken, TOKEN_TTL_SECONDS };
