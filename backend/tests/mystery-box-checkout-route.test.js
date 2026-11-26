const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

/*
 * Route-level tests for POST /mystery-box/:slug/checkout.
 * Stripe and the reservation service are stubbed, so these tests only exercise
 * the route contract: the server price is the only price sent to Stripe, the
 * sale window and the per-reader limit are enforced, and a reservation is
 * released when the Checkout Session cannot be created.
 */

const SERVER_PRICE_MINOR = 4900; // 49.00 EUR, decided by the reservation service

const sessions = [];
const expired = [];
const released = [];
const reservations = [];
let reservationError = null;
let sessionError = null;
let sessionWithoutUrl = false;

const stripe = {
  customers: { create: async () => ({ id: 'cus_route_test' }) },
  checkout: {
    sessions: {
      create: async (payload) => {
        if (sessionError) throw new Error(sessionError);
        sessions.push(payload);
        return {
          id: `cs_test_${sessions.length}`,
          url: sessionWithoutUrl ? null : `https://checkout.stripe.test/${sessions.length}`,
          status: 'open'
        };
      },
      expire: async (id) => {
        expired.push(id);
        return { id, status: 'expired' };
      }
    }
  }
};

const stripeUtils = require('../utils/stripe');
stripeUtils.createStripeClient = () => stripe;
stripeUtils.getClientAppUrl = () => 'http://localhost:8080';

const audit = require('../utils/audit');
audit.recordAudit = async () => {};

const service = require('../utils/mysteryBoxService');
let nextPurchaseId = 100;

function buildReservation() {
  const purchaseId = (nextPurchaseId += 1);
  return {
    purchase: {
      id: purchaseId,
      status: 'pending',
      amountItems: '49.00',
      amountShipping: '0.00',
      amountTotal: '49.00',
      currency: 'EUR',
      priceTier: 'standard',
      reservationExpiresAt: new Date(Date.now() + 31 * 60 * 1000),
      update: async () => {}
    },
    box: { id: 7, slug: 'ramadan-box', title: 'Ramadan box', translations: {}, tagline: 'Tag', requiresShipping: false },
    items: [{ id: 1, type: 'ebook', quantity: 1 }],
    price: { amountMinor: SERVER_PRICE_MINOR, amount: '49.00', currency: 'EUR', tier: 'standard' },
    shippingFee: { amountMinor: 0, amount: '0.00', freeShipping: true, country: null }
  };
}

service.createMysteryBoxReservation = async (input) => {
  reservations.push(input);
  if (reservationError) {
    const error = new Error(reservationError.message);
    error.status = reservationError.status;
    error.code = reservationError.code;
    throw error;
  }
  return buildReservation();
};
service.releaseMysteryBoxReservation = async (purchaseId) => {
  released.push(purchaseId);
  return null;
};

const { app } = require('../index');
const { MysteryBox, User } = require('../models');

test('mystery-box checkout keeps the server price and releases failed reservations', async (context) => {
  const previousSecret = process.env.JWT_SECRET_KEY;
  process.env.JWT_SECRET_KEY = 'test-secret-for-mystery-box-checkout';
  const originalFindUser = User.findByPk;
  const originalFindBox = MysteryBox.findOne;

  User.findByPk = async () => ({
    id: 42,
    role: 'READER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    tokenVersion: 0,
    mustChangePassword: false,
    language: 'fr',
    stripeCustomerId: 'cus_route_test',
    save: async () => {}
  });
  MysteryBox.findOne = async ({ where }) => ({
    id: 7,
    slug: where.slug,
    title: 'Ramadan box',
    translations: {},
    tagline: 'Tag',
    requiresShipping: false
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  context.after(async () => {
    User.findByPk = originalFindUser;
    MysteryBox.findOne = originalFindBox;
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  const token = jwt.sign(
    { id: 42, role: 'READER', status: 'ACTIVE', tokenVersion: 0 },
    process.env.JWT_SECRET_KEY
  );
  const url = `http://127.0.0.1:${server.address().port}/api/v1/mystery-box/ramadan-box/checkout`;
  const checkout = (body) => fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      language: 'fr',
      digitalContentConsent: true,
      ...body
    })
  });

  // 1. A price sent by the browser never reaches Stripe: the session uses the
  //    amount computed by the reservation service.
  const tampered = await checkout({ amount: '1.00', price: '1.00', unit_amount: 100, amountTotal: '0.01' });
  const tamperedBody = await tampered.json();
  assert.equal(tampered.status, 201, JSON.stringify(tamperedBody));
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].line_items[0].price_data.unit_amount, SERVER_PRICE_MINOR);
  assert.equal(sessions[0].mode, 'payment');
  assert.equal(reservations[0].boxId, 7);
  assert.equal(reservations[0].userId, 42);
  assert.equal(tamperedBody.summary.amountTotal, '49.00');

  // 2. Sold out: the service refuses, nothing is created at Stripe.
  reservationError = { status: 409, code: 'BOX_SOLD_OUT', message: 'This box is sold out.' };
  const soldOut = await checkout({ country: 'FR' });
  assert.equal(soldOut.status, 409);
  assert.equal((await soldOut.json()).code, 'BOX_SOLD_OUT');
  assert.equal(sessions.length, 1, 'no session may be created for a sold-out box');

  // 3. The sale window is over.
  reservationError = { status: 409, code: 'BOX_NOT_ACTIVE', message: 'This box is not on sale.' };
  const ended = await checkout({ country: 'FR' });
  assert.equal(ended.status, 409);
  assert.equal((await ended.json()).code, 'BOX_NOT_ACTIVE');
  assert.equal(sessions.length, 1);

  // 4. The per-reader limit is enforced by the server, not the page.
  reservationError = { status: 409, code: 'PER_USER_LIMIT', message: 'Limit reached.' };
  const limited = await checkout({ country: 'FR' });
  assert.equal(limited.status, 409);
  assert.equal((await limited.json()).code, 'PER_USER_LIMIT');
  assert.equal(sessions.length, 1);

  // 5. Stripe fails while creating the session: the reservation is released so
  //    the reader does not lose stock or a purchase slot.
  reservationError = null;
  sessionError = 'stripe is down';
  released.length = 0;
  const beforeFailure = nextPurchaseId;
  const failed = await checkout({ country: 'FR' });
  assert.equal(failed.status, 500);
  assert.equal(released.length, 1);
  assert.equal(released[0], beforeFailure + 1);
  sessionError = null;

  // 6. Stripe answers without a URL: the session is expired and the reservation
  //    is released too.
  sessionWithoutUrl = true;
  released.length = 0;
  expired.length = 0;
  const withoutUrl = await checkout({ country: 'FR' });
  assert.equal(withoutUrl.status, 500);
  assert.equal(expired.length, 1);
  assert.equal(released.length, 1);
  sessionWithoutUrl = false;

  // 7. The country is only read for physical boxes: a digital box ignores it,
  //    and the server still owns the price.
  sessions.length = 0;
  const digital = await checkout({ country: 'FR' });
  assert.equal(digital.status, 201);
  assert.equal(sessions[0].shipping_options, undefined);
  assert.equal(sessions[0].line_items[0].price_data.unit_amount, SERVER_PRICE_MINOR);
});
