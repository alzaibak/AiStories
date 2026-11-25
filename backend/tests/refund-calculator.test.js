const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRefund, explainRefund, toMinor, fromMinor } = require('../utils/returns/refundCalculator');

const base = {
  pricePaidMinor: 1500,
  definedShippingFeeMinor: 490,
  shippingFeeChargedMinor: 490,
  deliveryDeductionMode: 'defined_fee',
  orderReturnableValueMinor: 1500,
  returnedValueMinor: 1500,
  allReturnableReturned: true,
  daysSinceDelivery: 5,
  legalWithdrawalDays: 14,
  applyLegalWithdrawalRules: true
};

test('legal withdrawal period refunds the delivery fee', () => {
  const result = calculateRefund(base);
  assert.equal(result.legalPeriodApplied, true);
  assert.equal(result.deliveryFeeDeductionMinor, 0);
  assert.equal(result.refundMinor, 1500);
  assert.equal(result.refundAmount, '15.00');
});

test('commercial period deducts the defined delivery fee', () => {
  const result = calculateRefund({ ...base, daysSinceDelivery: 20 });
  assert.equal(result.legalPeriodApplied, false);
  assert.equal(result.deliveryFeeDeductionMinor, 490);
  assert.equal(result.refundMinor, 1010);
});

test('the legal period boundary day is still inside the legal window', () => {
  assert.equal(calculateRefund({ ...base, daysSinceDelivery: 14 }).legalPeriodApplied, true);
  assert.equal(calculateRefund({ ...base, daysSinceDelivery: 15 }).legalPeriodApplied, false);
});

test('seller fault always refunds everything including delivery', () => {
  const result = calculateRefund({ ...base, daysSinceDelivery: 45, sellerFault: true });
  assert.equal(result.sellerFaultOverride, true);
  assert.equal(result.deliveryFeeDeductionMinor, 0);
  assert.equal(result.refundMinor, 1500);
});

test('defined_fee deducts the fee even when shipping was free', () => {
  const result = calculateRefund({ ...base, daysSinceDelivery: 20, shippingFeeChargedMinor: 0 });
  assert.equal(result.deliveryFeeDeductionMinor, 490);
  assert.equal(result.refundMinor, 1010);
});

test('fee_paid deducts only what the customer actually paid', () => {
  const result = calculateRefund({
    ...base,
    daysSinceDelivery: 20,
    deliveryDeductionMode: 'fee_paid',
    shippingFeeChargedMinor: 0
  });
  assert.equal(result.deliveryFeeDeductionMinor, 0);
  assert.equal(result.refundMinor, 1500);
});

test('discounts are respected through the price actually paid', () => {
  const result = calculateRefund({ ...base, pricePaidMinor: 1200, orderReturnableValueMinor: 1200, returnedValueMinor: 1200 });
  assert.equal(result.refundMinor, 1200);
  const commercial = calculateRefund({
    ...base,
    pricePaidMinor: 1200,
    orderReturnableValueMinor: 1200,
    returnedValueMinor: 1200,
    daysSinceDelivery: 20
  });
  assert.equal(commercial.refundMinor, 710);
});

test('a partial multi-item return deducts a proportional share of the fee', () => {
  const result = calculateRefund({
    ...base,
    pricePaidMinor: 1000,
    orderReturnableValueMinor: 4000,
    returnedValueMinor: 1000,
    allReturnableReturned: false,
    daysSinceDelivery: 20
  });
  assert.equal(result.proportionalShare, 0.25);
  assert.equal(result.deliveryFeeShareMinor, 123);
  assert.equal(result.deliveryFeeDeductionMinor, 123);
  assert.equal(result.refundMinor, 877);
});

test('returning every returnable item deducts the whole fee exactly once', () => {
  const first = calculateRefund({
    ...base,
    pricePaidMinor: 2000,
    orderReturnableValueMinor: 4000,
    returnedValueMinor: 2000,
    allReturnableReturned: false,
    daysSinceDelivery: 20
  });
  const second = calculateRefund({
    ...base,
    pricePaidMinor: 2000,
    orderReturnableValueMinor: 4000,
    returnedValueMinor: 2000,
    allReturnableReturned: false,
    daysSinceDelivery: 20,
    alreadyDeductedFeeMinor: first.deliveryFeeDeductionMinor
  });
  assert.equal(first.deliveryFeeDeductionMinor, 245);
  assert.equal(second.deliveryFeeDeductionMinor, 245);
  assert.equal(first.refundMinor + second.refundMinor, 3510);
});

test('the deduction never exceeds the price paid and the refund is never negative', () => {
  const result = calculateRefund({
    ...base,
    pricePaidMinor: 200,
    orderReturnableValueMinor: 200,
    returnedValueMinor: 200,
    daysSinceDelivery: 20
  });
  assert.equal(result.deliveryFeeDeductionMinor, 200);
  assert.equal(result.refundMinor, 0);
  assert.ok(result.refundMinor >= 0);
});

test('refunds can never exceed the amount still paid on the order', () => {
  const result = calculateRefund({
    ...base,
    pricePaidMinor: 1500,
    daysSinceDelivery: 2,
    orderPaidMinor: 1500,
    alreadyRefundedMinor: 1200
  });
  assert.equal(result.cappedByAmountPaid, true);
  assert.equal(result.refundMinor, 300);
});

test('a partial refund after inspection is capped by the computed amount', () => {
  const result = calculateRefund({ ...base, daysSinceDelivery: 20, manualRefundMinor: 500 });
  assert.equal(result.refundMinor, 500);
  assert.equal(result.manualAdjustmentMinor, 510);
  const tooHigh = calculateRefund({ ...base, daysSinceDelivery: 20, manualRefundMinor: 999999 });
  assert.equal(tooHigh.refundMinor, 1010);
  assert.equal(tooHigh.manualAdjustmentMinor, 0);
});

test('a mystery box item uses its allocated share of price and shipping', () => {
  const result = calculateRefund({
    pricePaidMinor: 3333,
    definedShippingFeeMinor: 163,
    shippingFeeChargedMinor: 163,
    deliveryDeductionMode: 'defined_fee',
    orderReturnableValueMinor: 3333,
    returnedValueMinor: 3333,
    allReturnableReturned: true,
    daysSinceDelivery: 40,
    legalWithdrawalDays: 14,
    applyLegalWithdrawalRules: false
  });
  assert.equal(result.refundMinor, 3170);
});

test('rounding stays in cents for odd splits', () => {
  const result = calculateRefund({
    ...base,
    pricePaidMinor: 999,
    orderReturnableValueMinor: 1000,
    returnedValueMinor: 333,
    allReturnableReturned: false,
    daysSinceDelivery: 20
  });
  assert.equal(result.deliveryFeeShareMinor, 163);
  assert.equal(Number.isInteger(result.refundMinor), true);
});

test('the explanation lists the applied rule in all three languages', () => {
  const legal = calculateRefund(base);
  const commercial = calculateRefund({ ...base, daysSinceDelivery: 20 });
  const fault = calculateRefund({ ...base, sellerFault: true });
  for (const language of ['fr', 'en', 'ar']) {
    assert.match(explainRefund(legal, language).text, /./);
    assert.notEqual(explainRefund(commercial, language).text, explainRefund(legal, language).text);
    assert.notEqual(explainRefund(fault, language).text, explainRefund(legal, language).text);
  }
  assert.match(explainRefund(commercial, 'fr').text, /frais de livraison/i);
  assert.match(explainRefund(legal, 'fr').text, /rétractation/i);
});

test('money helpers round to cents', () => {
  assert.equal(toMinor('4.90'), 490);
  assert.equal(toMinor(15), 1500);
  assert.equal(fromMinor(1010), '10.10');
  assert.equal(fromMinor(0), '0.00');
});
