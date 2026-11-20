const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkoutShippingCountries,
  computeMysteryBoxState,
  duplicateBoxFields,
  effectivePrice,
  itemsValue,
  physicalCheckoutIssue,
  publicItems,
  remainingStock,
  savingsPercent,
  serializeHeader,
  shippingFeeFor,
  validateBoxForActivation
} = require('../utils/mysteryBox');
const { boxCreateSchema, checkoutSchema } = require('../middleware/mysteryBoxValidation');
const { hasPremiumEntitlement } = require('../utils/contentAccess');
const models = require('../models');

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
const baseBox = {
  status: 'active',
  startAt: past,
  endAt: future,
  price: '49.00',
  currency: 'EUR',
  stockLimit: 10,
  stockSold: 0,
  stockReserved: 0,
  earlyBirdPrice: null,
  earlyBirdEndsAt: null
};
const appearance = {
  headerLabel: 'صندوق رمضان',
  colorFrom: '#10523C',
  colorTo: '#C5A25A',
  accentColor: '#F3E3B8'
};
const boxItems = [
  {
    id: 1,
    type: 'printed_book',
    quantity: 1,
    itemStock: 10,
    displayName: 'كتاب مطبوع',
    isHiddenBeforePurchase: true,
    estimatedValue: '20.00',
    sortOrder: 0
  },
  {
    id: 2,
    type: 'ebook',
    quantity: 1,
    displayName: 'كتاب إلكتروني',
    isHiddenBeforePurchase: true,
    estimatedValue: '10.00',
    sortOrder: 1
  }
];

test('mystery box state follows dates, manual state and stock', () => {
  assert.equal(computeMysteryBoxState({ ...baseBox, status: 'draft' }, new Date()), 'draft');
  assert.equal(computeMysteryBoxState({ ...baseBox, status: 'archived' }, new Date()), 'archived');
  assert.equal(computeMysteryBoxState({ ...baseBox, startAt: future }, new Date()), 'scheduled');
  assert.equal(computeMysteryBoxState(baseBox, new Date()), 'active');
  assert.equal(computeMysteryBoxState({ ...baseBox, stockSold: 10 }, new Date()), 'sold_out');
  assert.equal(computeMysteryBoxState({ ...baseBox, endAt: past }, new Date()), 'ended');
  assert.equal(remainingStock({ ...baseBox, stockSold: 4, stockReserved: 2 }), 4);
  assert.equal(remainingStock({ ...baseBox, stockLimit: null }), null);
});

test('early bird pricing is server-side and switches after its real end date', () => {
  const earlyEnds = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const box = { ...baseBox, earlyBirdPrice: '39.00', earlyBirdEndsAt: earlyEnds };
  const early = effectivePrice(box, new Date());
  assert.equal(early.amount, '39.00');
  assert.equal(early.tier, 'early_bird');
  assert.equal(early.earlyBird.endsAt, earlyEnds.toISOString());
  const standard = effectivePrice(box, new Date(earlyEnds.getTime() + 1000));
  assert.equal(standard.amount, '49.00');
  assert.equal(standard.tier, 'standard');
});

test('shipping fee honours flat, free threshold and per-country overrides', () => {
  const shipping = {
    shippingFee: '4.90',
    freeShippingThreshold: '60.00',
    allowedCountries: ['FR', 'BE'],
    feeByCountry: { BE: 7.5 }
  };
  assert.equal(shippingFeeFor({ shipping, country: 'fr', subtotal: '49.00' }).amountMinor, 490);
  assert.equal(shippingFeeFor({ shipping, country: 'BE', subtotal: '49.00' }).amountMinor, 750);
  assert.equal(shippingFeeFor({ shipping, country: 'FR', subtotal: '65.00' }).amountMinor, 0);
  assert.throws(
    () => shippingFeeFor({ shipping, country: 'US', subtotal: '49.00' }),
    (error) => error.code === 'COUNTRY_NOT_ALLOWED'
  );
  assert.throws(
    () => shippingFeeFor({ shipping, country: undefined, subtotal: '49.00' }),
    (error) => error.code === 'COUNTRY_NOT_ALLOWED'
  );
});

test('Stripe address collection is locked to the country used for the fee', () => {
  const shipping = {
    shippingFee: '4.90',
    freeShippingThreshold: null,
    allowedCountries: ['FR', 'BE'],
    feeByCountry: { BE: 7.5 }
  };
  const frenchFee = shippingFeeFor({ shipping, country: 'FR', subtotal: '49.00' });
  const belgianFee = shippingFeeFor({ shipping, country: 'be', subtotal: '49.00' });
  assert.equal(belgianFee.amountMinor, 750);
  assert.deepEqual(checkoutShippingCountries(frenchFee), ['FR']);
  assert.deepEqual(checkoutShippingCountries(belgianFee), ['BE']);
  assert.notDeepEqual(checkoutShippingCountries(belgianFee), ['FR', 'BE']);
  assert.deepEqual(checkoutShippingCountries({ country: null }), []);
});

test('a physical box cannot be activated without shipping and a positive stock limit', () => {
  const physicalBox = { ...baseBox, title: 'صندوق مطبوع', compareAtValue: null };
  const physicalItem = { ...boxItems[0], itemStock: 20 };
  const shipping = {
    shippingFee: '4.90',
    allowedCountries: ['FR'],
    estimatedDeliveryMinDays: 3,
    estimatedDeliveryMaxDays: 7
  };
  const noShipping = validateBoxForActivation({
    box: physicalBox,
    items: [physicalItem],
    shipping: null,
    appearance
  });
  assert.ok(noShipping.missing.some((item) => item.code === 'shipping'));

  const noStock = validateBoxForActivation({
    box: { ...physicalBox, stockLimit: 0 },
    items: [physicalItem],
    shipping,
    appearance
  });
  assert.ok(noStock.missing.some((item) => item.code === 'stock_limit'));

  const complete = validateBoxForActivation({
    box: physicalBox,
    items: [physicalItem],
    shipping,
    appearance
  });
  assert.equal(complete.valid, true);
});

test('checkout guard rejects a physical box without shipping or a positive stock limit', () => {
  const physicalItem = boxItems[0];
  const digitalItem = boxItems[1];
  const shipping = { shippingFee: '4.90', allowedCountries: ['FR'] };

  assert.equal(physicalCheckoutIssue({ items: [physicalItem], box: { stockLimit: 10 }, shipping }), null);

  const noShipping = physicalCheckoutIssue({ items: [physicalItem], box: { stockLimit: 10 }, shipping: null });
  assert.equal(noShipping.code, 'SHIPPING_REQUIRED');
  assert.equal(noShipping.status, 409);

  for (const stockLimit of [0, '0', null, undefined, -1]) {
    const issue = physicalCheckoutIssue({ items: [physicalItem], box: { stockLimit }, shipping });
    assert.equal(issue.code, 'STOCK_LIMIT_REQUIRED', `stockLimit ${stockLimit} must be rejected`);
    assert.equal(issue.status, 409);
  }

  const digitalOnly = physicalCheckoutIssue({
    items: [digitalItem],
    box: { stockLimit: null },
    shipping: null
  });
  assert.equal(digitalOnly, null);

  const shippedBox = { requiresShipping: true, stockLimit: 10 };
  assert.equal(physicalCheckoutIssue({ items: [digitalItem], box: shippedBox, shipping }), null);
  assert.equal(
    physicalCheckoutIssue({ items: [digitalItem], box: shippedBox, shipping: null }).code,
    'SHIPPING_REQUIRED'
  );
  assert.equal(
    physicalCheckoutIssue({ items: [digitalItem], box: { requiresShipping: true, stockLimit: 0 }, shipping }).code,
    'STOCK_LIMIT_REQUIRED'
  );
});

test('duplicating a box copies the digital consent wording but resets its lifecycle', () => {
  const copy = duplicateBoxFields({
    ...baseBox,
    slug: 'ramadan-box',
    title: 'صندوق رمضان',
    digitalConsentText: 'أوافق على التسليم الفوري للمحتوى الرقمي.',
    translations: { en: { title: 'Ramadan box' } },
    startAt: past,
    endAt: future,
    stockSold: 4,
    stockReserved: 2,
    viewCount: 12,
    headerClickCount: 8
  }, 42);
  assert.equal(copy.digitalConsentText, 'أوافق على التسليم الفوري للمحتوى الرقمي.');
  assert.deepEqual(copy.translations, { en: { title: 'Ramadan box' } });
  assert.equal(copy.status, 'draft');
  assert.equal(copy.createdBy, 42);
  assert.equal(copy.startAt, undefined);
  assert.equal(copy.endAt, undefined);
  assert.equal(copy.stockSold, undefined);
  assert.equal(copy.stockReserved, undefined);
  assert.equal(copy.slug, undefined);
});

test('hidden items are masked until purchase according to reveal mode', () => {
  const hidden = publicItems(boxItems, { language: 'ar', revealMode: 'hidden_until_purchase' });
  assert.equal(hidden[0].displayName, null);
  assert.equal(hidden[0].type, null);
  assert.equal(hidden[0].isHidden, true);

  const teaser = publicItems(boxItems, { language: 'ar', revealMode: 'teaser' });
  assert.equal(teaser[0].type, 'printed_book');
  assert.equal(teaser[0].displayName, null);

  const full = publicItems(boxItems, { language: 'ar', revealMode: 'full' });
  assert.equal(full[0].displayName, 'كتاب مطبوع');
  assert.equal(full[0].estimatedValue, '20.00');

  const revealed = publicItems(boxItems, { language: 'ar', revealMode: 'hidden_until_purchase', revealed: true });
  assert.equal(revealed[0].displayName, 'كتاب مطبوع');
  assert.equal(itemsValue(boxItems), 30);
});

test('activation requires title, items, dates, appearance and enough physical stock', () => {
  const valid = validateBoxForActivation({
    box: { ...baseBox, title: 'صندوق', compareAtValue: null },
    items: boxItems,
    shipping: { shippingFee: '4.90', allowedCountries: ['FR'], estimatedDeliveryMinDays: 3, estimatedDeliveryMaxDays: 7 },
    appearance
  });
  assert.equal(valid.valid, true);

  const missing = validateBoxForActivation({ box: {}, items: [], appearance: null });
  const codes = missing.missing.map((item) => item.code);
  for (const code of ['title_ar', 'items', 'price', 'start_at', 'end_at', 'appearance']) {
    assert.ok(codes.includes(code), `expected ${code}`);
  }

  const shortStock = validateBoxForActivation({
    box: { ...baseBox, title: 'صندوق', stockLimit: 10 },
    items: [{ ...boxItems[0], itemStock: 5 }],
    shipping: { shippingFee: '4.90', allowedCountries: ['FR'], estimatedDeliveryMinDays: 3, estimatedDeliveryMaxDays: 7 },
    appearance
  });
  assert.ok(shortStock.missing.some((item) => item.code === 'item_stock'));

  const physicalBoxNoShipping = validateBoxForActivation({
    box: { ...baseBox, title: 'صندوق', compareAtValue: null, requiresShipping: true },
    items: [boxItems[1]],
    shipping: null,
    appearance
  });
  assert.ok(physicalBoxNoShipping.missing.some((item) => item.code === 'shipping'));

  const physicalBoxWithShipping = validateBoxForActivation({
    box: { ...baseBox, title: 'صندوق', compareAtValue: null, requiresShipping: true },
    items: [boxItems[1]],
    shipping: { shippingFee: '4.90', allowedCountries: ['FR'], estimatedDeliveryMinDays: 3, estimatedDeliveryMaxDays: 7 },
    appearance
  });
  assert.equal(physicalBoxWithShipping.valid, true);
});

test('header payload disappears when the box is not active', () => {
  const header = serializeHeader({ ...baseBox, slug: 'ramadan', title: 'صندوق' }, {
    items: boxItems,
    appearance,
    language: 'ar'
  });
  assert.equal(header.slug, 'ramadan');
  assert.equal(header.showCountdownInHeader, true);
  assert.equal(header.almostSoldOut, false);
  assert.equal(serializeHeader({ ...baseBox, status: 'draft' }, { items: boxItems, appearance }), null);
  assert.equal(serializeHeader({ ...baseBox, stockSold: 10 }, { items: boxItems, appearance }), null);
  assert.equal(savingsPercent('49.00', '100.00'), 51);
});

test('checkout and admin schemas validate the public contract', () => {
  assert.equal(checkoutSchema.safeParse({ language: 'fr', country: 'fr', digitalContentConsent: true }).success, true);
  assert.equal(checkoutSchema.safeParse({ language: 'fr', country: 'FRA' }).success, false);
  const created = boxCreateSchema.safeParse({
    title: 'صندوق تجريبي',
    price: 49,
    requiresShipping: true,
    items: [{ type: 'ebook', displayName: 'كتاب' }],
    appearance: { headerLabel: 'تجريبي' }
  });
  assert.equal(created.success, true);
  assert.equal(created.data.requiresShipping, true);
  assert.equal(boxCreateSchema.safeParse({ title: 'صندوق', price: 49, items: [{ type: 'random', displayName: 'x' }] }).success, false);
});

test('premium access days unlock paid reading like an active subscription', async () => {
  const activeModel = {
    async findAll() {
      return [{ startsAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 86400000), revokedAt: null }];
    }
  };
  const expiredModel = {
    async findAll() {
      return [{ startsAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() - 1000), revokedAt: null }];
    }
  };
  assert.equal(await hasPremiumEntitlement(7, new Date(), activeModel), true);
  assert.equal(await hasPremiumEntitlement(7, new Date(), expiredModel), false);
  assert.equal(await hasPremiumEntitlement(null, new Date(), activeModel), false);
});

test('mystery box models expose the required fields', () => {
  assert.ok(models.MysteryBox.rawAttributes.stockReserved);
  assert.equal(models.MysteryBox.rawAttributes.allowRandomItems.defaultValue, false);
  assert.ok(models.MysteryBoxPurchase.rawAttributes.reservationExpiresAt);
  assert.ok(models.MysteryBoxPurchase.rawAttributes.digitalContentConsentAt);
  assert.ok(models.MysteryBoxItem.rawAttributes.itemStock);
  assert.ok(models.MysteryBoxShipping.rawAttributes.allowedCountries);
  assert.ok(models.MysteryBoxAppearance.rawAttributes.almostSoldOutThreshold);
  assert.ok(models.Entitlement.rawAttributes.mysteryBoxPurchaseId);
  assert.ok(models.Entitlement.rawAttributes.resourceType.values.includes('premium'));
});
