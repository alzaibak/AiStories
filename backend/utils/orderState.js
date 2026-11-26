/* Pure order state machine and money checks. No database access. */

const ORDER_STATUSES = [
  'pending', 'pending_payment', 'paid', 'fulfilled', 'failed', 'expired',
  'canceled', 'cancelled', 'refunded', 'partially_refunded', 'amount_mismatch'
];

const TRANSITIONS = {
  pending: ['pending_payment', 'paid', 'failed', 'expired', 'canceled', 'cancelled', 'amount_mismatch'],
  pending_payment: ['paid', 'failed', 'expired', 'canceled', 'cancelled', 'amount_mismatch'],
  paid: ['fulfilled', 'refunded', 'partially_refunded', 'amount_mismatch'],
  fulfilled: ['refunded', 'partially_refunded'],
  failed: [],
  expired: [],
  canceled: [],
  cancelled: [],
  refunded: [],
  partially_refunded: ['refunded'],
  amount_mismatch: ['pending_payment', 'paid', 'refunded']
};

/**
 * Statuses a reader may see in the account. Checkout attempts that were never
 * paid (pending, pending_payment, expired, failed, canceled) are never listed,
 * so no reader surface can show an abandoned order as "pending".
 */
const READER_VISIBLE_ORDER_STATUSES = ['paid', 'fulfilled', 'refunded', 'partially_refunded', 'amount_mismatch'];

function isReaderVisibleOrderStatus(status) {
  return READER_VISIBLE_ORDER_STATUSES.includes(normalizeOrderStatus(status));
}

function normalizeOrderStatus(status) {
  if (status === 'pending') return 'pending_payment';
  if (status === 'cancelled') return 'canceled';
  return ORDER_STATUSES.includes(status) ? status : 'pending_payment';
}

/** Human labels for anything that prints an order status (exports, emails). */
const ORDER_STATUS_LABELS = {
  pending: { ar: 'بانتظار الدفع', en: 'Awaiting payment', fr: 'En attente de paiement' },
  pending_payment: { ar: 'بانتظار الدفع', en: 'Awaiting payment', fr: 'En attente de paiement' },
  paid: { ar: 'قيد التجهيز', en: 'Processing', fr: 'En préparation' },
  fulfilled: { ar: 'مكتمل', en: 'Completed', fr: 'Terminée' },
  failed: { ar: 'فشل الدفع', en: 'Payment failed', fr: 'Paiement échoué' },
  expired: { ar: 'انتهت المهلة', en: 'Expired', fr: 'Expirée' },
  canceled: { ar: 'ملغى', en: 'Cancelled', fr: 'Annulée' },
  cancelled: { ar: 'ملغى', en: 'Cancelled', fr: 'Annulée' },
  refunded: { ar: 'مسترجع', en: 'Refunded', fr: 'Remboursée' },
  partially_refunded: { ar: 'مسترجع جزئياً', en: 'Partially refunded', fr: 'Partiellement remboursée' },
  amount_mismatch: { ar: 'قيد المراجعة', en: 'Under review', fr: 'En vérification' }
};

function orderStatusLabel(status, language = 'ar') {
  const key = String(status || '');
  const entry = ORDER_STATUS_LABELS[key] || ORDER_STATUS_LABELS[normalizeOrderStatus(key)];
  return entry?.[language] || entry?.fr || key;
}

function canTransition(from, to) {
  const current = normalizeOrderStatus(from);
  const next = normalizeOrderStatus(to);
  return Boolean(TRANSITIONS[current]?.includes(next));
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(`Invalid order transition: ${from} -> ${to}.`);
    error.status = 409;
    error.code = 'INVALID_ORDER_TRANSITION';
    throw error;
  }
  return true;
}

function expectedTotalMinor({ subtotalMinor, shippingMinor = 0, discountMinor = 0, taxMinor = 0 }) {
  const total = Number(subtotalMinor) + Number(shippingMinor) + Number(taxMinor) - Number(discountMinor);
  if (!Number.isSafeInteger(total) || total < 0) {
    const error = new Error('The order total is invalid.');
    error.status = 400;
    error.code = 'INVALID_ORDER_TOTAL';
    throw error;
  }
  return total;
}

/**
 * Stripe is the source of truth for what was captured, but the amount must
 * equal the server-computed order total. A mismatch is never fulfilled.
 */
function paymentMatchesOrder(session, order) {
  if (!session || !order) return { matches: false, reason: 'missing_session_or_order' };
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return { matches: false, reason: 'not_paid' };
  }
  const expected = Number(order.totalMinor);
  const actual = Number(session.amount_total);
  if (!Number.isSafeInteger(expected) || expected < 0) {
    return { matches: false, reason: 'missing_expected_total' };
  }
  if (!Number.isSafeInteger(actual) || actual < 0) {
    return { matches: false, reason: 'missing_stripe_total' };
  }
  if (expected !== actual) {
    return { matches: false, reason: 'amount_mismatch', expected, actual };
  }
  const expectedCurrency = String(order.currency || '').toUpperCase();
  const actualCurrency = String(session.currency || '').toUpperCase();
  if (!expectedCurrency || expectedCurrency !== actualCurrency) {
    return { matches: false, reason: 'currency_mismatch', expectedCurrency, actualCurrency };
  }
  return { matches: true, amountMinor: actual, currency: actualCurrency };
}

function makeOrderNumber(id, now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = String(id).padStart(6, '0');
  return `IS-${date}-${suffix}`;
}

module.exports = {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  orderStatusLabel,
  READER_VISIBLE_ORDER_STATUSES,
  isReaderVisibleOrderStatus,
  TRANSITIONS,
  normalizeOrderStatus,
  canTransition,
  assertTransition,
  expectedTotalMinor,
  paymentMatchesOrder,
  makeOrderNumber
};
