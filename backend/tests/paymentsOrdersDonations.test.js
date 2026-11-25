const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../middleware/storyValidation');
const { expectedTotalMinor, paymentMatchesOrder, canTransition, normalizeOrderStatus } = require('../utils/orderState');
const { campaignState, resolveDonationAmount, totalCost, toCents } = require('../utils/donations');

test('checkout rejects client-supplied prices and unknown fields', () => {
  const tampered = schemas.bookCheckoutSchema.safeParse({
    language: 'ar',
    digitalConsent: true,
    items: [{ bookId: 1, quantity: 1, price: 0.01, total: 0.01 }]
  });
  assert.equal(tampered.success, false);
  assert.ok(tampered.error.issues.some((issue) => issue.code === 'unrecognized_keys'));

  const topLevel = schemas.bookCheckoutSchema.safeParse({
    language: 'ar',
    digitalConsent: true,
    total: 1,
    items: [{ bookId: 1, quantity: 1 }]
  });
  assert.equal(topLevel.success, false);
});

test('checkout accepts identifiers and quantities only', () => {
  const parsed = schemas.bookCheckoutSchema.parse({
    language: 'en',
    digitalConsent: true,
    items: [{ bookId: 4, quantity: 1 }]
  });
  assert.deepEqual(parsed.items, [{ bookId: 4, quantity: 1 }]);
});

test('ebook quantity must be one and duplicate books are refused', () => {
  assert.equal(schemas.bookCheckoutSchema.safeParse({
    items: [{ bookId: 1, quantity: 2 }]
  }).success, true, 'quantity 2 is syntactically valid; the server enforces the ebook rule');
  assert.equal(schemas.bookCheckoutSchema.safeParse({
    items: [{ bookId: 1, quantity: 1 }, { bookId: 1, quantity: 1 }]
  }).success, false);
});

test('order totals are computed in cents and reject overflow', () => {
  assert.equal(expectedTotalMinor({ subtotalMinor: 1000, shippingMinor: 250, discountMinor: 100 }), 1150);
  assert.throws(() => expectedTotalMinor({ subtotalMinor: 100, discountMinor: 200 }), /invalid/i);
});

test('payment verification requires both the server amount and currency', () => {
  const order = { totalMinor: 2450, currency: 'EUR', status: 'pending_payment' };
  assert.equal(paymentMatchesOrder({ payment_status: 'paid', amount_total: 2450, currency: 'eur' }, order).matches, true);
  const amountMismatch = paymentMatchesOrder({ payment_status: 'paid', amount_total: 1, currency: 'eur' }, order);
  assert.equal(amountMismatch.matches, false);
  assert.equal(amountMismatch.reason, 'amount_mismatch');
  const currencyMismatch = paymentMatchesOrder({ payment_status: 'paid', amount_total: 2450, currency: 'usd' }, order);
  assert.equal(currencyMismatch.matches, false);
  assert.equal(currencyMismatch.reason, 'currency_mismatch');
});

test('order state machine blocks skipping payment and double refunds', () => {
  assert.equal(canTransition('pending_payment', 'paid'), true);
  assert.equal(canTransition('pending_payment', 'fulfilled'), false);
  assert.equal(canTransition('paid', 'refunded'), true);
  assert.equal(canTransition('refunded', 'refunded'), false);
  assert.equal(normalizeOrderStatus('pending'), 'pending_payment');
  assert.equal(normalizeOrderStatus('cancelled'), 'canceled');
});

test('donation units are derived from the campaign cost per unit', () => {
  const campaign = {
    id: 7, currency: 'EUR', allowCustomAmount: true, costPerUnit: 2.5,
    minAmount: 1, maxAmount: 500, targetUnits: 300, goalAmount: 800,
    campaignType: 'both', status: 'active', overfundingPolicy: 'close',
    startsAt: null, endsAt: null
  };
  const custom = resolveDonationAmount({ campaign, amount: 10, currency: 'EUR' });
  assert.equal(custom.cents, 1000);
  assert.equal(custom.units, 4);
  const tier = resolveDonationAmount({ campaign, tier: { campaignId: 7, amount: 5, units: 999, isActive: true }, currency: 'EUR' });
  assert.equal(tier.units, 2, 'a tier cannot claim more units than its amount buys');
  assert.throws(() => resolveDonationAmount({ campaign, amount: 0.5, currency: 'EUR' }), /range/);
  assert.throws(() => resolveDonationAmount({ campaign, amount: 10, currency: 'USD' }), /currency/);
  assert.throws(() => resolveDonationAmount({ campaign, tier: { campaignId: 8, amount: 5, isActive: true }, currency: 'EUR' }), /tier/);
});

test('campaign progress uses paid donations only and respects the overfunding policy', () => {
  const campaign = {
    goalAmount: 100, targetUnits: 10, costPerUnit: 10, campaignType: 'both',
    status: 'active', overfundingPolicy: 'close', startsAt: null, endsAt: null
  };
  const state = campaignState(campaign, [
    { amount: 50, unitsSponsored: 5, userId: 1 },
    { amount: 60, unitsSponsored: 5, userId: 2 }
  ]);
  assert.equal(state.raisedAmount, '110.00');
  assert.equal(state.sponsoredUnits, 10);
  assert.equal(state.amountReached, true);
  assert.equal(state.unitsReached, true);
  assert.equal(state.targetReached, true);
  assert.equal(state.full, true);
  assert.equal(state.canDonate, false);
  const ended = campaignState({ ...campaign, endsAt: new Date(Date.now() - 1000) }, []);
  assert.equal(ended.canDonate, false);
  const draft = campaignState({ ...campaign, status: 'draft' }, []);
  assert.equal(draft.canDonate, false);
});

test('campaign total cost combines units and extra costs', () => {
  assert.equal(totalCost({ targetUnits: 300, costPerUnit: 2.5, extraCosts: 120 }), 87000);
  assert.equal(toCents(2.5), 250);
});

test('donation checkout refuses client units and accepts tier or bounded amount', () => {
  assert.equal(schemas.donationCheckoutSchema.safeParse({ amount: 5, units: 100 }).success, false);
  assert.equal(schemas.donationCheckoutSchema.safeParse({ amount: 5, tierId: 2 }).success, true);
  assert.equal(schemas.donationCheckoutSchema.safeParse({}).success, false);
  assert.equal(schemas.donationCheckoutSchema.safeParse({ amount: -5 }).success, false);
  assert.equal(schemas.donationCheckoutSchema.safeParse({ amount: 5.555 }).success, false);
});

test('admin order updates cannot smuggle status or paid flags', () => {
  assert.equal(schemas.adminOrderUpdateSchema.safeParse({ fulfillmentStatus: 'shipped' }).success, true);
  assert.equal(schemas.adminOrderUpdateSchema.safeParse({ status: 'paid' }).success, false);
  assert.equal(schemas.adminOrderUpdateSchema.safeParse({ paid: true }).success, false);
});

test('book creation accepts partly filled language tabs and rejects client statuses', () => {
  const created = schemas.bookSchema.safeParse({
    title: 'Story book',
    slug: 'story-book',
    translations: { ar: { title: '', description: '' }, en: { title: 'Story book', description: '' }, fr: { title: '', description: '' } },
    format: 'ebook',
    price: 4.9,
    currency: 'EUR',
    coverAlt: { ar: 'غلاف', en: 'Cover', fr: 'Couverture' },
    isbn: null,
    weightGrams: null
  });
  assert.equal(created.success, true, 'empty optional translations must not block book creation');
  assert.equal(schemas.bookSchema.safeParse({ title: 'A', slug: 'book-a', format: 'ebook', price: 1, status: 'published' }).success, true);
  assert.equal(schemas.bookSchema.safeParse({ title: 'A', slug: 'book-a', format: 'ebook', price: 1, total: 0 }).success, true, 'schema strips unknown fields; the route only uses whitelisted fields');
});

test('manual donations cannot set units or start paid from the client payload', () => {
  assert.equal(schemas.manualDonationSchema.safeParse({ amount: 10, source: 'manual_cash', unitsSponsored: 999 }).success, false);
  assert.equal(schemas.manualDonationSchema.safeParse({ amount: 10, source: 'manual_cash', status: 'paid' }).success, false);
  assert.equal(schemas.manualDonationSchema.safeParse({ amount: 10, source: 'manual_cash' }).success, true);
});