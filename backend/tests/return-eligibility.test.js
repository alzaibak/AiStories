const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../models');
const service = require('../utils/returns/service');

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-05-20T12:00:00.000Z');

const settings = {
  returnsEnabled: true,
  defaultReturnWindowDays: 30,
  legalWithdrawalDays: 14,
  applyLegalWithdrawalRules: true,
  deliveryDeductionMode: 'defined_fee',
  returnAddress: {},
  shipBackDeadlineDays: 14,
  refundDeadlineDays: 14,
  defaultDeliveryEstimateDays: 7,
  reasons: []
};

function daysAgo(days) {
  return new Date(now.getTime() - days * DAY_MS);
}

function makeOrder({ deliveredAt = daysAgo(5), shippedAt = daysAgo(9), returnWindowDays = null } = {}) {
  return {
    id: 7001,
    userId: 12,
    status: 'paid',
    fulfillmentStatus: 'delivered',
    currency: 'EUR',
    subtotal: '24.90',
    total: '29.80',
    discountAmount: null,
    paidAmount: '29.80',
    shippedAt,
    deliveredAt,
    items: [{
      id: 601,
      orderId: 7001,
      bookId: 3,
      titleSnapshot: 'Livre papier',
      unitPrice: '24.90',
      quantity: 1,
      pricePaidAfterDiscount: '24.90',
      definedShippingFee: '4.90',
      shippingFeeCharged: '4.90',
      isReturnable: true,
      returnWindowDays,
      legalWithdrawalDays: 14,
      book: { id: 3, title: 'Livre papier', format: 'print', isReturnable: true, returnWindowDays, cover: null }
    }]
  };
}

let lastOrderQuery = null;

async function quoteFor(order, overrides = {}) {
  models.StoreOrder.findOne = async (options) => {
    lastOrderQuery = options;
    return order;
  };
  models.PromoCodeRedemption.findOne = async () => null;
  models.ReturnRequest.findAll = async () => [];
  return service.orderReturnQuote({ orderId: order.id, settings, now, ...overrides });
}

test('the exact last day of the 30-day window is still eligible', async () => {
  const result = await quoteFor(makeOrder({ deliveredAt: daysAgo(30) }));
  assert.equal(result.items[0].eligible, true);
  assert.equal(result.items[0].reasons.includes('window_closed'), false);
});

test('one day past the window is refused with window_closed', async () => {
  const result = await quoteFor(makeOrder({ deliveredAt: daysAgo(31) }));
  assert.equal(result.items[0].eligible, false);
  assert.ok(result.items[0].reasons.includes('window_closed'));
});

test('a 60-day item snapshot overrides the 30-day default', async () => {
  const result = await quoteFor(makeOrder({ deliveredAt: daysAgo(45), returnWindowDays: 60 }));
  assert.equal(result.items[0].eligible, true);
  assert.equal(result.items[0].windowDays, 60);
});

test('a policy change does not rewrite the window of an existing order', async () => {
  const order = makeOrder({ deliveredAt: daysAgo(45), returnWindowDays: 30 });
  const result = await quoteFor(order, { settings: { ...settings, defaultReturnWindowDays: 60 } });
  assert.equal(result.items[0].windowDays, 30);
  assert.equal(result.items[0].eligible, false);
  assert.ok(result.items[0].reasons.includes('window_closed'));
});

test('a missing deliveredAt falls back to the shipping estimate', async () => {
  const order = makeOrder({ deliveredAt: null, shippedAt: daysAgo(10) });
  const result = await quoteFor(order);
  assert.equal(result.deliveryDateSource, 'shipped_estimate');
  assert.equal(result.daysSinceDelivery, 3);
  assert.equal(result.items[0].eligible, true);
});

test('an already returned quantity cannot be requested twice', async () => {
  const order = makeOrder();
  models.ReturnRequest.findAll = async () => [{
    items: [{ sourceType: 'order_item', orderItemId: 601, quantity: 1, deliveryFeeDeduction: '0.00', refundAmount: '24.90' }]
  }];
  models.StoreOrder.findOne = async () => order;
  models.PromoCodeRedemption.findOne = async () => null;

  const result = await service.orderReturnQuote({ orderId: order.id, settings, now });
  assert.equal(result.items[0].availableQuantity, 0);
  assert.equal(result.items[0].eligible, false);
  assert.ok(result.items[0].reasons.includes('already_returned'));
  assert.equal(result.totals.refundMinor, 0);
});

test('reader quotes only load the reader own order', async () => {
  await quoteFor(makeOrder(), { userId: 12 });
  assert.equal(lastOrderQuery.where.userId, 12);

  models.ReturnRequest.findOne = async () => null;
  await assert.rejects(
    service.getReturnRequest(601, { userId: 99 }),
    (error) => error.status === 404
  );
});
