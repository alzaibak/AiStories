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
    return hasActiveSubscription(userId, now, subscriptionModel);
  }

  const free = Boolean(story.isFree || story.collection?.isFree || part.isFree);
  if (!userId) return free && guestCanReadPart(story, part);
  if (free) return true;

  return hasActiveSubscription(userId, now, subscriptionModel);
}

async function canAccessBook({ userId, role, book, now = new Date(), entitlementModel = Entitlement }) {
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
  return entitlements.some((entitlement) =>
    !entitlement.revokedAt &&
    new Date(entitlement.startsAt) <= now &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt) > now)
  );
}

module.exports = {
  subscriptionIsActive,
  guestCanReadPart,
  hasActiveSubscription,
  canAccessPart,
  canAccessBook
};
