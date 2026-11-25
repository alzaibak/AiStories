const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../utils/returns/policy');

const DAY = 24 * 60 * 60 * 1000;

test('the delivery date prefers deliveredAt, then the shipping estimate', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const delivered = policy.resolveDeliveryDate({
    deliveredAt: '2026-05-28T10:00:00Z',
    shippedAt: '2026-05-20T10:00:00Z',
    fallbackDays: 7,
    now
  });
  assert.equal(delivered.source, 'delivered_at');
  assert.equal(new Date(delivered.date).toISOString(), '2026-05-28T10:00:00.000Z');

  const estimated = policy.resolveDeliveryDate({
    deliveredAt: null,
    shippedAt: '2026-05-20T10:00:00Z',
    fallbackDays: 7,
    now
  });
  assert.equal(estimated.source, 'shipped_estimate');
  assert.equal(new Date(estimated.date).getTime(), new Date('2026-05-27T10:00:00Z').getTime());

  const missing = policy.resolveDeliveryDate({ deliveredAt: null, shippedAt: null, now });
  assert.equal(missing.date, null);
  assert.equal(missing.source, 'missing');
});

test('an estimate in the future is clamped to today', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const resolved = policy.resolveDeliveryDate({
    shippedAt: new Date(now.getTime() - 2 * DAY),
    fallbackDays: 7,
    now
  });
  assert.equal(new Date(resolved.date).getTime(), now.getTime());
  assert.equal(resolved.source, 'shipped_estimate');
});

test('the return window counts from the delivery date and honours the per-item snapshot', () => {
  const deliveredAt = new Date('2026-06-01T00:00:00Z');
  const windowEnd = policy.addDays(deliveredAt, 30);
  assert.equal(policy.daysBetween(deliveredAt, windowEnd), 30);
  assert.equal(policy.itemWindowDays({ returnWindowDays: 60 }, { defaultReturnWindowDays: 30 }), 60);
  assert.equal(policy.itemWindowDays({ returnWindowDays: null, book: { returnWindowDays: 45 } }, { defaultReturnWindowDays: 30 }), 45);
  assert.equal(policy.itemWindowDays({}, { defaultReturnWindowDays: 60 }), 60);
});

test('settings fall back to safe defaults in three languages', () => {
  const settings = policy.normalizeSettings({});
  assert.equal(settings.defaultReturnWindowDays, 30);
  assert.equal(settings.legalWithdrawalDays, 14);
  assert.equal(settings.applyLegalWithdrawalRules, true);
  assert.equal(settings.deliveryDeductionMode, 'defined_fee');
  assert.equal(settings.returnShippingPayer, 'customer');
  assert.ok(settings.reasons.length >= 6);
  assert.ok(policy.localizedValue(settings.policyText, 'fr').includes('livres papier'));
  assert.ok(policy.localizedValue(settings.conditionText, 'ar').length > 10);
});

test('seller-fault reasons are flagged and photos are required for defects', () => {
  const settings = policy.normalizeSettings({});
  assert.equal(policy.reasonByCode(settings, 'damaged').isSellerFault, true);
  assert.equal(policy.reasonByCode(settings, 'wrong_item').isSellerFault, true);
  assert.equal(policy.reasonByCode(settings, 'lost_parcel').isSellerFault, true);
  assert.equal(policy.reasonByCode(settings, 'no_longer_needed').isSellerFault, false);
  assert.equal(policy.reasonByCode(settings, 'damaged').requiresPhotos, true);
  assert.equal(policy.reasonByCode(settings, 'unknown_code'), null);
});

test('the return address is rendered on separate lines', () => {
  const text = policy.formatReturnAddress({
    name: 'Islamic Stories',
    line1: '12 rue des Livres',
    postalCode: '75011',
    city: 'Paris',
    country: 'France'
  });
  assert.equal(text, 'Islamic Stories\n12 rue des Livres\n75011 Paris\nFrance');
  assert.equal(policy.formatReturnAddress({}, '—'), '—');
});
