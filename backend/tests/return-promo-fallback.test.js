const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-03-20T12:00:00.000Z');
const deliveredAt = new Date(now.getTime() - 2 * DAY_MS);

const settings = {
  returnsEnabled: true,
  deliveryDeductionMode: 'fee_paid',
  legalWithdrawalDays: 14,
  applyLegalWithdrawalRules: true,
  defaultReturnWindowDays: 14,
  defaultDeliveryEstimateDays: 3,
  refundDeadlineDays: 14
};

/*
 * Legacy order written before `paidAmount` existed:
 *  - discountAmount is NULL (the reduction only lives in promo_code_redemptions),
 *  - the item snapshots still hold the GROSS prices,
 *  - the order total is what Stripe actually charged (80 - 20 = 60).
 */
function legacyOrder() {
  return {
    id: 9001,
    userId: 12,
    status: 'paid',
    fulfillmentStatus: 'delivered',
    currency: 'EUR',
    subtotal: '80.00',
    total: '60.00',
    discountAmount: null,
    paidAmount: null,
    shippedAt: new Date(deliveredAt.getTime() - 2 * DAY_MS),
    deliveredAt,
    user: { id: 12, firstName: 'Sam', lastName: 'Reader', email: 'sam@example.test', language: 'fr', returnsBlocked: false },
    items: [
      {
        id: 501,
        orderId: 9001,
        bookId: 1,
        titleSnapshot: 'Livre A',
        unitPrice: '50.00',
        quantity: 1,
        pricePaidAfterDiscount: '50.00',
        definedShippingFee: '0.00',
        shippingFeeCharged: '0.00',
        isReturnable: true,
        book: { id: 1, title: 'Livre A', format: 'print', isReturnable: true, returnWindowDays: 14, cover: null }
      },
      {
        id: 502,
        orderId: 9001,
        bookId: 2,
        titleSnapshot: 'Livre B',
        unitPrice: '30.00',
        quantity: 1,
        pricePaidAfterDiscount: '30.00',
        definedShippingFee: '0.00',
        shippingFeeCharged: '0.00',
        isReturnable: true,
        book: { id: 2, title: 'Livre B', format: 'print', isReturnable: true, returnWindowDays: 14, cover: null }
      }
    ]
  };
}

async function quote(overrides = {}) {
  models.StoreOrder.findOne = async () => legacyOrder();
  models.PromoCodeRedemption.findOne = async () => ({ amountDiscounted: '20.00' });
  models.ReturnRequest.findAll = async () => [];
  const service = require('../utils/returns/service');
  return service.orderReturnQuote({ orderId: 9001, settings, now, ...overrides });
}

test('a promo saved only in promo_code_redemptions drives the refund quote', async () => {
  const result = await quote();

  // The recovered discount is exposed and the capture cap uses the net total.
  assert.equal(result.totals.discountMinor, 2000);
  assert.equal(result.totals.amountPaidMinor, 6000);
  assert.equal(result.totals.refundMinor, 6000);

  const first = result.items.find((item) => item.orderItemId === 501);
  const second = result.items.find((item) => item.orderItemId === 502);
  // 20 € off an 80 € cart is 25 %: the lines pay 37.50 and 22.50, not 50 and 30.
  assert.equal(first.pricePaid, '37.50');
  assert.equal(second.pricePaid, '22.50');
  assert.equal(first.refund.amountMinor, 3750);
  assert.equal(second.refund.amountMinor, 2250);

  // Regression guard: trusting the gross snapshot would refund 50 and 30.
  assert.notEqual(first.refund.amountMinor, 5000);
  assert.notEqual(second.refund.amountMinor, 3000);
});

test('the refund cap of a legacy discounted order is the price actually paid', async () => {
  const result = await quote({ selection: [{ orderItemId: 501, quantity: 1 }] });

  assert.equal(result.totals.refundMinor, 3750);
  assert.equal(result.items.find((item) => item.orderItemId === 501).refund.amountMinor, 3750);
  assert.equal(result.items.find((item) => item.orderItemId === 502).quantity, 0);
});

test('an order without promo redemption keeps its gross prices', async () => {
  models.StoreOrder.findOne = async () => {
    const order = legacyOrder();
    order.discountAmount = null;
    order.total = '80.00';
    order.items = order.items.map((item) => ({ ...item, pricePaidAfterDiscount: null }));
    return order;
  };
  models.PromoCodeRedemption.findOne = async () => null;
  models.ReturnRequest.findAll = async () => [];
  const service = require('../utils/returns/service');

  const result = await service.orderReturnQuote({ orderId: 9001, settings, now });
  assert.equal(result.totals.discountMinor, 0);
  assert.equal(result.totals.amountPaidMinor, 8000);
  assert.equal(result.items.find((item) => item.orderItemId === 501).refund.amountMinor, 5000);
});
