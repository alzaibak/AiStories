const Stripe = require('stripe');

function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    const error = new Error('Stripe payment processing is not configured.');
    error.status = 503;
    error.code = 'PAYMENTS_UNAVAILABLE';
    throw error;
  }
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10000 });
}

function getClientAppUrl() {
  const configuredUrl = process.env.CLIENT_APP_URL || 'http://localhost:8080';
  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error('CLIENT_APP_URL must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('CLIENT_APP_URL must use HTTP or HTTPS and must not contain credentials.');
  }
  return url.origin;
}

function toMinorUnits(price, currency, { allowZero = false } = {}) {
  let fractionDigits;
  try {
    fractionDigits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    const error = new Error('The configured price currency is invalid.');
    error.status = 400;
    throw error;
  }

  const value = Number(price);
  const amount = Math.round(value * (10 ** fractionDigits));
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0) || !Number.isSafeInteger(amount) ||
    Math.abs(value - amount / (10 ** fractionDigits)) > 1e-8) {
    const error = new Error('The price must be a positive amount supported by the selected currency.');
    error.status = 400;
    throw error;
  }
  return amount;
}

function mapStripeSubscriptionStatus(status) {
  const mapped = {
    incomplete: 'incomplete',
    incomplete_expired: 'expired',
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
    paused: 'paused'
  }[status];
  if (!mapped) throw new Error(`Unsupported Stripe subscription status: ${status}`);
  return mapped;
}

function getInvoiceSubscriptionId(invoice) {
  const subscription = invoice.subscription || invoice.parent?.subscription_details?.subscription || null;
  return typeof subscription === 'string' ? subscription : subscription?.id || null;
}

module.exports = {
  createStripeClient,
  getClientAppUrl,
  toMinorUnits,
  mapStripeSubscriptionStatus,
  getInvoiceSubscriptionId
};
