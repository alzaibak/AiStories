const { Op } = require('sequelize');
const { Subscription, Entitlement } = require('../models');

const privilegedRoles = new Set(['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER']);
const subscriptionStatuses = ['active', 'trialing', 'past_due', 'canceled'];

function subscriptionIsActive(subscription, now = new Date()) {
  const expiresAt = subscription.expiresAt ? new Date(subscription.expiresAt) : null;
  if (expiresAt && expiresAt <= now) return false;

  if (subscription.status === 'active' || subscription.status === 'trialing') return true;
  if (subscription.status === 'past_due') {
    return Boolean(subscription.gracePeriodEndsAt && new Date(subscription.gracePeriodEndsAt) > now);
  }
  return subscription.status === 'canceled' && Boolean(expiresAt && expiresAt > now);
}

function guestCanReadPart(story, part) {
  return part.partNumber === 1 && Boolean(story.isFree || story.collection?.isFree);
}

async function findActiveEntitlement({ userId, storyId, partId, now, entitlementModel }) {
  const entitlements = await entitlementModel.findAll({
    where: {
      userId,
      revokedAt: null,
      startsAt: { [Op.lte]: now },
      [Op.or]: [
        { resourceType: 'story', resourceId: storyId },
        { resourceType: 'part', resourceId: partId }
      ]
    }
  });
  return entitlements.some((entitlement) =>
    !entitlement.revokedAt &&
    new Date(entitlement.startsAt) <= now &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt) > now)
  );
}

async function hasPremiumEntitlement(userId, now = new Date(), entitlementModel = Entitlement) {
  if (!userId) return false;
  const entitlements = await entitlementModel.findAll({
    where: {
      userId,
      resourceType: 'premium',
      revokedAt: null,
      startsAt: { [Op.lte]: now }
    }
  });
  return entitlements.some((entitlement) =>
    !entitlement.revokedAt &&
    new Date(entitlement.startsAt) <= now &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt) > now)
  );
}

async function hasActiveSubscription(userId, now = new Date(), subscriptionModel = Subscription) {
  const subscriptions = await subscriptionModel.findAll({
    where: { userId, status: { [Op.in]: subscriptionStatuses } }
  });
  return subscriptions.some((subscription) => subscriptionIsActive(subscription, now));
}

async function canAccessPart({
  userId,
  role,
  story,
  part,
  now = new Date(),
  subscriptionModel = Subscription,
  entitlementModel = Entitlement
}) {
  if (privilegedRoles.has(role)) return true;

  const hasEntitlement = userId && await findActiveEntitlement({
    userId,
    storyId: story.id,
    partId: part.id,
    now,
    entitlementModel
  });
  if (hasEntitlement) return true;

  if (part.releaseAt && new Date(part.releaseAt) > now) {
    if (!userId || !part.earlyAccessUntil || new Date(part.earlyAccessUntil) <= now) return false;
    return await hasActiveSubscription(userId, now, subscriptionModel) ||
      await hasPremiumEntitlement(userId, now, entitlementModel);
  }

  const free = Boolean(story.isFree || story.collection?.isFree || part.isFree);
  if (!userId) return free && guestCanReadPart(story, part);
  if (free) return true;

  return await hasActiveSubscription(userId, now, subscriptionModel) ||
    await hasPremiumEntitlement(userId, now, entitlementModel);
}

function hasDownloadQuota(entitlement) {
  const limit = entitlement.downloadLimit;
  if (limit === null || limit === undefined) return true;
  return Number(entitlement.downloadCount || 0) < Number(limit);
}

async function canAccessBook({
  userId,
  role,
  book,
  now = new Date(),
  entitlementModel = Entitlement,
  allowExhausted = false
}) {
  if (privilegedRoles.has(role)) return true;
  if (!userId) return false;
  const entitlements = await entitlementModel.findAll({
    where: {
      userId,
      resourceType: 'book',
      resourceId: book.id,
      revokedAt: null,
      startsAt: { [Op.lte]: now }
    }
  });
  const active = entitlements.filter((entitlement) =>
    !entitlement.revokedAt &&
    new Date(entitlement.startsAt) <= now &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt) > now)
  );
  if (!active.length) return false;
  if (allowExhausted) return true;
  // One usable right is enough: an unlimited right (rental, subscription) keeps
  // access open, and a re-bought book comes with a fresh entitlement that hands
  // out a new download while the previous, spent right stays in the library.
  return active.some((entitlement) => hasDownloadQuota(entitlement));
}

module.exports = {
  subscriptionIsActive,
  guestCanReadPart,
  hasActiveSubscription,
  hasPremiumEntitlement,
  canAccessPart,
  canAccessBook,
  hasDownloadQuota
};
