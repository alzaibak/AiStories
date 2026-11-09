const test = require('node:test');
const assert = require('node:assert/strict');
const {
  subscriptionIsActive,
  guestCanReadPart,
  canAccessPart,
  canAccessBook
} = require('../utils/contentAccess');

const now = new Date('2026-11-09T10:00:00.000Z');
const story = {
  id: 5,
  isFree: false,
  collection: { isFree: false }
};
const part = {
  id: 8,
  partNumber: 1,
  isFree: false,
  releaseAt: null,
  earlyAccessUntil: null
};

test('les visiteurs peuvent uniquement lire la première partie d’une collection gratuite', () => {
  assert.equal(guestCanReadPart({ isFree: false, collection: { isFree: true } }, part), true);
  assert.equal(guestCanReadPart({ isFree: false, collection: { isFree: true } }, { ...part, partNumber: 2 }), false);
  assert.equal(guestCanReadPart(story, part), false);
});

test('les statuts d’abonnement respectent expiration et période de grâce', () => {
  assert.equal(subscriptionIsActive({ status: 'active', expiresAt: null }, now), true);
  assert.equal(subscriptionIsActive({
    status: 'active',
    expiresAt: new Date('2026-11-09T09:59:59.000Z')
  }, now), false);
  assert.equal(subscriptionIsActive({
    status: 'past_due',
    gracePeriodEndsAt: new Date('2026-11-09T10:01:00.000Z')
  }, now), true);
  assert.equal(subscriptionIsActive({
    status: 'past_due',
    gracePeriodEndsAt: new Date('2026-11-09T09:59:00.000Z')
  }, now), false);
  assert.equal(subscriptionIsActive({
    status: 'canceled',
    expiresAt: new Date('2026-11-09T10:01:00.000Z')
  }, now), true);
});

test('le service d’accès autorise un abonnement actif et refuse un abonnement expiré', async () => {
  const activeSubscriptionModel = {
    async findAll() {
      return [{ status: 'active', expiresAt: new Date('2026-11-10T00:00:00.000Z') }];
    }
  };
  const expiredSubscriptionModel = {
    async findAll() {
      return [{ status: 'active', expiresAt: new Date('2026-11-08T00:00:00.000Z') }];
    }
  };
  const noEntitlements = { async findAll() { return []; } };

  assert.equal(await canAccessPart({
    userId: 12, role: 'READER', story, part, now,
    subscriptionModel: activeSubscriptionModel, entitlementModel: noEntitlements
  }), true);
  assert.equal(await canAccessPart({
    userId: 12, role: 'READER', story, part, now,
    subscriptionModel: expiredSubscriptionModel, entitlementModel: noEntitlements
  }), false);
});

test('la fenêtre de publication bloque les visiteurs et permet le préaccès abonné', async () => {
  const futurePart = {
    ...part,
    releaseAt: new Date('2026-11-12T00:00:00.000Z'),
    earlyAccessUntil: new Date('2026-11-10T00:00:00.000Z')
  };
  const active = { async findAll() { return [{ status: 'active', expiresAt: null }]; } };
  const expired = { async findAll() { return []; } };
  const noEntitlements = { async findAll() { return []; } };
  assert.equal(await canAccessPart({
    userId: null, story: { ...story, isFree: true }, part: futurePart, now,
    subscriptionModel: expired, entitlementModel: noEntitlements
  }), false);
  assert.equal(await canAccessPart({
    userId: 12, story, part: futurePart, now,
    subscriptionModel: active, entitlementModel: noEntitlements
  }), true);
  assert.equal(await canAccessPart({
    userId: 12, story, part: { ...futurePart, earlyAccessUntil: new Date('2026-11-08T00:00:00.000Z') }, now,
    subscriptionModel: active, entitlementModel: noEntitlements
  }), false);
});

test('un entitlement expiré ou révoqué ne donne pas accès au contenu', async () => {
  const subscriptions = { async findAll() { return []; } };
  const entitlement = (overrides = {}) => ({
    userId: 12,
    resourceType: 'part',
    resourceId: part.id,
    startsAt: new Date('2026-11-01T00:00:00.000Z'),
    expiresAt: new Date('2026-11-10T00:00:00.000Z'),
    revokedAt: null,
    ...overrides
  });
  const model = (row) => ({ async findAll() { return [row]; } });

  assert.equal(await canAccessPart({
    userId: 12, role: 'READER', story, part, now,
    subscriptionModel: subscriptions, entitlementModel: model(entitlement())
  }), true);
  assert.equal(await canAccessPart({
    userId: 12, role: 'READER', story, part, now,
    subscriptionModel: subscriptions,
    entitlementModel: model(entitlement({ expiresAt: new Date('2026-11-09T09:59:00.000Z') }))
  }), false);
  assert.equal(await canAccessPart({
    userId: 12, role: 'READER', story, part, now,
    subscriptionModel: subscriptions,
    entitlementModel: model(entitlement({ revokedAt: new Date('2026-11-09T09:00:00.000Z') }))
  }), false);
});

test('un téléchargement de livre exige un entitlement valide', async () => {
  const book = { id: 9 };
  const valid = {
    async findAll() {
      return [{
        startsAt: new Date('2026-11-01T00:00:00.000Z'),
        expiresAt: new Date('2026-11-10T00:00:00.000Z'),
        revokedAt: null
      }];
    }
  };
  const expired = {
    async findAll() {
      return [{
        startsAt: new Date('2026-11-01T00:00:00.000Z'),
        expiresAt: new Date('2026-11-08T00:00:00.000Z'),
        revokedAt: null
      }];
    }
  };
  assert.equal(await canAccessBook({ userId: 12, role: 'READER', book, now, entitlementModel: valid }), true);
  assert.equal(await canAccessBook({ userId: 12, role: 'READER', book, now, entitlementModel: expired }), false);
});
