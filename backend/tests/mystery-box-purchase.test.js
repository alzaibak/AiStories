const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeMysteryBoxState,
  effectivePrice,
  physicalCheckoutIssue,
  remainingStock,
  serializeHeader,
  shippingFeeFor
} = require('../utils/mysteryBox');
const { checkoutSchema } = require('../middleware/mysteryBoxValidation');

const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
const baseBox = {
  slug: 'ramadan-box',
  status: 'active',
  startAt: past,
  endAt: future,
  price: '49.00',
  currency: 'EUR',
  stockLimit: 10,
  stockSold: 0,
  stockReserved: 0,
  earlyBirdPrice: null,
  earlyBirdEndsAt: null,
  perUserLimit: 1,
  requiresShipping: false
};
const appearance = {
  headerLabel: 'صندوق رمضان',
  colorFrom: '#10523C',
  colorTo: '#C5A25A',
  accentColor: '#F3E3B8',
  almostSoldOutThreshold: null
};
const items = [
  { id: 1, type: 'ebook', displayName: 'كتاب إلكتروني' },
  { id: 2, type: 'digital_extra', displayName: 'بطاقة' }
];

test('the header exposes the real tier price chosen by the server', () => {
  const early = serializeHeader(
    { ...baseBox, earlyBirdPrice: '39.00', earlyBirdEndsAt: future },
    { items, appearance, now: new Date() }
  );
  assert.equal(early.price.tier, 'early_bird');
  assert.equal(early.price.amount, '39.00');

  const standard = serializeHeader(
    { ...baseBox, earlyBirdPrice: '39.00', earlyBirdEndsAt: past },
    { items, appearance, now: new Date() }
  );
  assert.equal(standard.price.tier, 'standard');
  assert.equal(standard.price.amount, '49.00');
  assert.equal(standard.itemCount, 2);
});

test('a client-sent price never reaches the checkout payload', () => {
  const parsed = checkoutSchema.parse({
    language: 'ar',
    country: 'fr',
    digitalContentConsent: true,
    amount: '1.00',
    price: '1.00',
    unit_amount: 100,
    amountTotal: '1.00'
  });
  assert.equal(parsed.country, 'FR');
  assert.equal(parsed.amount, undefined);
  assert.equal(parsed.price, undefined);
  assert.equal(parsed.unit_amount, undefined);
  assert.equal(parsed.amountTotal, undefined);
  assert.deepEqual(Object.keys(parsed).sort(), ['country', 'digitalContentConsent', 'language']);
});

test('a sold-out drop stays announced but cannot be bought', () => {
  const soldOut = { ...baseBox, stockSold: 9, stockReserved: 1 };
  assert.equal(remainingStock(soldOut), 0);
  assert.equal(computeMysteryBoxState(soldOut, new Date()), 'sold_out');
  const header = serializeHeader(soldOut, { items, appearance, now: new Date() });
  assert.equal(header.state, 'sold_out');
  assert.equal(header.remaining, 0);
  assert.equal(header.almostSoldOut, false);
});

test('a drop that has not started is announced without being purchasable', () => {
  const scheduled = { ...baseBox, status: 'scheduled', startAt: future };
  const header = serializeHeader(scheduled, { items, appearance, now: new Date() });
  assert.equal(header.state, 'scheduled');
  assert.equal(new Date(header.startsAt).toISOString(), scheduled.startAt.toISOString());
  assert.equal(computeMysteryBoxState(scheduled, new Date()), 'scheduled');
});

test('an ended drop disappears everywhere', () => {
  const ended = { ...baseBox, endAt: past };
  assert.equal(serializeHeader(ended, { items, appearance, now: new Date() }), null);
  assert.equal(computeMysteryBoxState(ended, new Date()), 'ended');
});

test('almost sold out follows the admin threshold, defaulting to five', () => {
  const lowStock = { ...baseBox, stockSold: 6 };
  assert.equal(serializeHeader(lowStock, { items, appearance, now: new Date() }).almostSoldOut, true);
  const raised = { ...appearance, almostSoldOutThreshold: 1 };
  assert.equal(serializeHeader(lowStock, { items, appearance: raised, now: new Date() }).almostSoldOut, false);
  const noLimit = { ...baseBox, stockLimit: null };
  assert.equal(serializeHeader(noLimit, { items, appearance, now: new Date() }).remaining, null);
  assert.equal(serializeHeader(noLimit, { items, appearance, now: new Date() }).almostSoldOut, false);
});

test('a physical box needs shipping settings and a real stock limit', () => {
  const physicalItems = [{ id: 1, type: 'printed_book', quantity: 1 }];
  assert.equal(physicalCheckoutIssue({ items: physicalItems, box: baseBox, shipping: null }).code, 'SHIPPING_REQUIRED');
  assert.equal(
    physicalCheckoutIssue({ items: physicalItems, box: { ...baseBox, stockLimit: null }, shipping: { id: 1 } }).code,
    'STOCK_LIMIT_REQUIRED'
  );
  assert.equal(physicalCheckoutIssue({ items: physicalItems, box: baseBox, shipping: { id: 1 } }), null);
  assert.equal(physicalCheckoutIssue({ items, box: baseBox, shipping: null }), null);
});

test('shipping is priced for the buyer country and only that country is collected', () => {
  const shipping = {
    shippingFee: '4.90',
    freeShippingThreshold: null,
    feeByCountry: { FR: '4.90', BE: '7.50' },
    allowedCountries: ['FR', 'BE']
  };
  const france = shippingFeeFor({ shipping, country: 'fr', subtotal: '49.00', currency: 'EUR' });
  assert.equal(france.amount, '4.90');
  assert.equal(france.country, 'FR');
  const belgium = shippingFeeFor({ shipping, country: 'BE', subtotal: '49.00', currency: 'EUR' });
  assert.equal(belgium.amount, '7.50');
  assert.throws(
    () => shippingFeeFor({ shipping, country: 'US', subtotal: '49.00', currency: 'EUR' }),
    (error) => error.code === 'COUNTRY_NOT_ALLOWED'
  );
});

test('the tier price can change between two server reads without client input', () => {
  const box = { ...baseBox, earlyBirdPrice: '30.00', earlyBirdEndsAt: new Date(Date.now() + 1000) };
  const before = effectivePrice(box, new Date());
  const after = effectivePrice(box, new Date(Date.now() + 5000));
  assert.equal(before.tier, 'early_bird');
  assert.equal(after.tier, 'standard');
  assert.equal(after.amountTotal, undefined);
});
