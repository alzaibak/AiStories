const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateDiscount, resolveOrderPaidMinor } = require('../utils/returns/orderAmounts');
const { calculateRefund } = require('../utils/returns/refundCalculator');

test('a discount is allocated over every line and sums exactly', () => {
  assert.deepEqual(allocateDiscount([5000, 5000], 2000), [4000, 4000]);
  const thirds = allocateDiscount([3333, 3333, 3334], 1000);
  assert.equal(thirds.reduce((sum, value) => sum + value, 0), 9000);
  assert.equal(thirds.length, 3);
});

test('allocation never drifts by a cent', () => {
  const net = allocateDiscount([100, 100, 100], 100);
  assert.equal(net.reduce((sum, value) => sum + value, 0), 200);
  assert.ok(net.every((value) => value >= 0));
  const netOdd = allocateDiscount([999, 1], 500);
  assert.equal(netOdd.reduce((sum, value) => sum + value, 0), 500);
});

test('no discount keeps the gross values', () => {
  assert.deepEqual(allocateDiscount([1999, 2500], 0), [1999, 2500]);
  assert.deepEqual(allocateDiscount([], 500), []);
});

test('a discount larger than the cart is clamped to the cart', () => {
  assert.deepEqual(allocateDiscount([1000, 2000], 99999), [0, 0]);
});

test('paid amount is derived from the real discount and the shipping charged', () => {
  const amounts = resolveOrderPaidMinor({
    subtotalMinor: 10000,
    totalMinor: 8500,
    discountMinor: 3000,
    shippingChargedMinor: 1500
  });
  assert.equal(amounts.netSubtotalMinor, 7000);
  assert.equal(amounts.paidMinor, 8500);
  assert.equal(amounts.derivedPaidMinor, 8500);
});

test('the captured Stripe amount wins over the local estimate', () => {
  const amounts = resolveOrderPaidMinor({
    subtotalMinor: 10000,
    totalMinor: 8500,
    discountMinor: 3000,
    capturedMinor: 8300
  });
  assert.equal(amounts.paidMinor, 8300);
  assert.equal(amounts.capturedMinor, 8300);
});

test('a discounted order cannot refund above the captured amount', () => {
  const netItems = allocateDiscount([5000, 5000], 2000);
  assert.deepEqual(netItems, [4000, 4000]);

  let alreadyRefunded = 0;
  const first = calculateRefund({
    pricePaidMinor: netItems[0],
    deliveryDeductionMode: 'fee_paid',
    shippingFeeChargedMinor: 0,
    orderReturnableValueMinor: 8000,
    returnedValueMinor: 4000,
    allReturnableReturned: false,
    legalWithdrawalDays: 14,
    daysSinceDelivery: 2,
    orderPaidMinor: 8000,
    alreadyRefundedMinor: alreadyRefunded
  });
  assert.equal(first.refundMinor, 4000);
  alreadyRefunded += first.refundMinor;

  const second = calculateRefund({
    pricePaidMinor: netItems[1],
    deliveryDeductionMode: 'fee_paid',
    shippingFeeChargedMinor: 0,
    orderReturnableValueMinor: 8000,
    returnedValueMinor: 8000,
    allReturnableReturned: true,
    legalWithdrawalDays: 14,
    daysSinceDelivery: 2,
    orderPaidMinor: 8000,
    alreadyRefundedMinor: alreadyRefunded
  });
  assert.equal(second.refundMinor, 4000);
  assert.equal(alreadyRefunded + second.refundMinor, 8000);

  const overshoot = calculateRefund({
    pricePaidMinor: 4000,
    orderPaidMinor: 8000,
    alreadyRefundedMinor: 7000,
    shippingFeeChargedMinor: 0,
    deliveryDeductionMode: 'fee_paid'
  });
  assert.equal(overshoot.refundMinor, 1000);
  assert.equal(overshoot.cappedByAmountPaid, true);
});

test('without the fix a gross snapshot would exceed what was captured', () => {
  // Regression guard: 50 + 50 gross refunded from an 80 order is impossible.
  const gross = calculateRefund({ pricePaidMinor: 5000, orderPaidMinor: 8000, shippingFeeChargedMinor: 0 });
  const net = calculateRefund({ pricePaidMinor: 4000, orderPaidMinor: 8000, shippingFeeChargedMinor: 0 });
  assert.equal(gross.refundMinor, 5000);
  assert.equal(net.refundMinor, 4000);
});
