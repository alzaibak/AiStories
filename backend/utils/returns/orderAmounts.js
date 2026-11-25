/*
 * Order amount derivation for returns.
 *
 * Two rules keep refunds honest on discounted orders:
 *  1. an item's paid value is its gross price minus its real share of the
 *     discount (order.discountAmount or the promo redemption), never the gross;
 *  2. the refund cap is what Stripe actually captured, which is stored on the
 *     order at settlement (`paidAmount`). When that snapshot is missing we
 *     rebuild it from subtotal - discount + shipping.
 *
 * Pure functions only: no database or Stripe access.
 */

function toMinor(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function fromMinor(minor) {
  return (Math.round(Number(minor) || 0) / 100).toFixed(2);
}

/**
 * Split a discount over gross amounts with the largest-remainder method, so the
 * net amounts always sum exactly to gross - discount (no drifting cents).
 * Returns the NET amount of every line, in the same order.
 */
function allocateDiscount(grossAmounts = [], discountMinor = 0) {
  const gross = grossAmounts.map((value) => Math.max(0, Math.round(Number(value) || 0)));
  const totalGross = gross.reduce((sum, value) => sum + value, 0);
  const discount = Math.min(Math.max(0, Math.round(Number(discountMinor) || 0)), totalGross);
  if (!totalGross || !discount) return gross;

  const shares = gross.map((value) => (value * discount) / totalGross);
  const floors = shares.map((value) => Math.floor(value));
  let remainder = discount - floors.reduce((sum, value) => sum + value, 0);
  const byFraction = shares
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || b.index - a.index);
  const discountPerLine = floors.slice();
  for (let index = 0; remainder > 0 && index < byFraction.length; index += 1) {
    discountPerLine[byFraction[index].index] += 1;
    remainder -= 1;
  }
  return gross.map((value, index) => Math.max(0, value - discountPerLine[index]));
}

/**
 * Rebuild the amounts actually charged for an order.
 * `capturedMinor` (Stripe checkout amount_total at settlement) always wins: it
 * is the only value that stays exact for percentage coupons, which Stripe also
 * applies to shipping.
 */
function resolveOrderPaidMinor({
  subtotalMinor = 0,
  totalMinor = 0,
  discountMinor = 0,
  shippingChargedMinor = null,
  capturedMinor = null
} = {}) {
  const subtotal = Math.max(0, Math.round(Number(subtotalMinor) || 0));
  const total = Math.max(0, Math.round(Number(totalMinor) || 0));
  const discount = Math.min(subtotal, Math.max(0, Math.round(Number(discountMinor) || 0)));
  const netSubtotal = Math.max(0, subtotal - discount);
  const shipping = shippingChargedMinor === null || shippingChargedMinor === undefined
    ? Math.max(0, total - netSubtotal)
    : Math.max(0, Math.round(Number(shippingChargedMinor) || 0));
  const derived = netSubtotal + shipping;
  const captured = capturedMinor === null || capturedMinor === undefined
    ? null
    : Math.max(0, Math.round(Number(capturedMinor) || 0));
  return {
    subtotalMinor: subtotal,
    netSubtotalMinor: netSubtotal,
    discountMinor: discount,
    shippingMinor: shipping,
    derivedPaidMinor: derived,
    capturedMinor: captured,
    paidMinor: captured === null ? derived : captured
  };
}

module.exports = { toMinor, fromMinor, allocateDiscount, resolveOrderPaidMinor };
