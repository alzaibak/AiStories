const test = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const { Op } = require('sequelize');
const models = require('../models');
const {
  stripeWebhookHandler,
  verifyStripeWebhookSignature,
  settleStoreOrder,
  reconcileOrderWithStripe
} = require('../routes/payments');

const previousSecretKey = process.env.STRIPE_SECRET_KEY;
const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY = 'sk_test_webhook_unit_test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_webhook_unit_test';
test.after(() => {
  if (previousSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = previousSecretKey;
  if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
});

function fakeTransaction() {
  return {
    LOCK: { UPDATE: 'UPDATE' },
    finished: false,
    commit: async () => {},
    rollback: async () => {}
  };
}

function fakeOrder(status = 'pending_payment') {
  const order = {
    id: 42,
    status,
    total: '20.00',
    totalMinor: 2000,
    currency: 'EUR',
    userId: 7,
    stripeCheckoutSessionId: 'cs_test_order',
    updates: [],
    update: async (values) => {
      order.updates.push(values);
      Object.assign(order, values);
    }
  };
  return order;
}

function paidSession(overrides = {}) {
  return {
    id: 'cs_test_order',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 2000,
    currency: 'eur',
    metadata: { orderId: '42' },
    ...overrides
  };
}

function patchModels(context, { order, events = [], items = [], cart = null, destroyed = [], entitlements = [] }) {
  const original = {
    findByPk: models.StoreOrder.findByPk,
    orderItems: models.StoreOrderItem.findAll,
    cart: models.StoreCart.findOne,
    cartItemDestroy: models.StoreCartItem.destroy,
    orderEvent: models.StoreOrderEvent.create,
    securityEvent: models.SecurityEvent.create,
    entitlementFindOne: models.Entitlement.findOne,
    entitlementCreate: models.Entitlement.create,
    transaction: models.sequelize.transaction
  };
  models.StoreOrder.findByPk = async () => order;
  models.StoreOrderItem.findAll = async () => items;
  models.StoreCart.findOne = async () => cart;
  models.StoreCartItem.destroy = async (options) => { destroyed.push(options); return 1; };
  models.StoreOrderEvent.create = async (values) => { events.push(values); return values; };
  models.SecurityEvent.create = async () => ({});
  models.Entitlement.findOne = async () => null;
  models.Entitlement.create = async (values, options) => { entitlements.push({ values, options }); return values; };
  models.sequelize.transaction = async () => fakeTransaction();
  context.after(() => {
    models.StoreOrder.findByPk = original.findByPk;
    models.StoreOrderItem.findAll = original.orderItems;
    models.StoreCart.findOne = original.cart;
    models.StoreCartItem.destroy = original.cartItemDestroy;
    models.StoreOrderEvent.create = original.orderEvent;
    models.SecurityEvent.create = original.securityEvent;
    models.Entitlement.findOne = original.entitlementFindOne;
    models.Entitlement.create = original.entitlementCreate;
    models.sequelize.transaction = original.transaction;
  });
}

test('a webhook signature is accepted only with the configured secret', () => {
  const payload = JSON.stringify({ id: 'evt_signature', type: 'customer.created', data: { object: { id: 'cus_1' } } });
  const good = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  assert.equal(verifyStripeWebhookSignature(Buffer.from(payload), good, process.env.STRIPE_WEBHOOK_SECRET).id, 'evt_signature');
  assert.throws(() => verifyStripeWebhookSignature(Buffer.from(payload), 'v1=forged', process.env.STRIPE_WEBHOOK_SECRET));
});

test('a duplicate Stripe event is acknowledged without processing it twice', async (context) => {
  const payload = JSON.stringify({
    id: 'evt_duplicate',
    type: 'customer.created',
    data: { object: { id: 'cus_1', metadata: {} } }
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const originalStripeEvent = models.StripeEvent.findOrCreate;
  const originalProcessed = models.ProcessedWebhookEvent.findOrCreate;
  const originalTransaction = models.sequelize.transaction;
  models.StripeEvent.findOrCreate = async () => [{ update: async () => {} }, true];
  models.ProcessedWebhookEvent.findOrCreate = async () => [{}, false];
  models.sequelize.transaction = async () => fakeTransaction();
  context.after(() => {
    models.StripeEvent.findOrCreate = originalStripeEvent;
    models.ProcessedWebhookEvent.findOrCreate = originalProcessed;
    models.sequelize.transaction = originalTransaction;
  });
  const req = {
    method: 'POST',
    originalUrl: '/api/v1/payments/webhook',
    ip: '127.0.0.1',
    body: Buffer.from(payload),
    headers: {},
    get: (name) => name.toLowerCase() === 'stripe-signature' ? signature : undefined
  };
  let status = 0;
  let body;
  const res = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; }
  };
  await stripeWebhookHandler(req, res);
  assert.equal(status, 0);
  assert.deepEqual(body, { received: true, duplicate: true });
});

test('an expired event cannot downgrade an already paid order', async (context) => {
  const order = fakeOrder('paid');
  patchModels(context, { order });
  const result = await settleStoreOrder({ id: 'cs_expired', metadata: { orderId: '42' }, status: 'expired' }, 'expired', fakeTransaction(), { source: 'webhook' });
  assert.equal(result, false);
  assert.equal(order.status, 'paid');
  assert.deepEqual(order.updates, []);
});

test('an amount or currency mismatch is recorded and never fulfilled', async (context) => {
  const events = [];
  const order = fakeOrder();
  patchModels(context, { order, events });
  const result = await settleStoreOrder(paidSession({ amount_total: 100, currency: 'usd' }), 'paid', fakeTransaction(), { source: 'webhook' });
  assert.equal(result.amountMismatch, true);
  assert.equal(order.status, 'amount_mismatch');
  assert.equal(order.updates.some((entry) => entry.status === 'paid' || entry.status === 'fulfilled'), false);
  assert.ok(events.some((entry) => entry.type === 'amount_mismatch'));
});

test('a currency mismatch alone is rejected even when the amount matches', async (context) => {
  const order = fakeOrder();
  patchModels(context, { order });
  const result = await settleStoreOrder(paidSession({ currency: 'usd' }), 'paid', fakeTransaction(), { source: 'webhook' });
  assert.equal(result.amountMismatch, true);
  assert.equal(order.status, 'amount_mismatch');
  assert.equal(order.updates.some((entry) => entry.status === 'paid' || entry.status === 'fulfilled'), false);
});

test('a validated payment removes purchased books from the cart in the same transaction and leaves other items alone', async (context) => {
  const order = fakeOrder();
  const transaction = fakeTransaction();
  const destroyed = [];
  const entitlements = [];
  const items = [
    { id: 11, bookId: 101, book: { id: 101, format: 'ebook' } },
    { id: 12, bookId: 102, book: { id: 102, format: 'print' } },
    { id: 13, bookId: 103, book: { id: 103, format: 'ebook' } }
  ];
  patchModels(context, { order, items, cart: { id: 55 }, destroyed, entitlements });

  const result = await settleStoreOrder(paidSession(), 'paid', transaction, { source: 'webhook' });

  assert.equal(result.settled, true);
  // One deletion per purchased line: a book kept in the cart under another
  // language must survive the payment.
  assert.equal(destroyed.length, 3);
  assert.ok(destroyed.every((call) => call.transaction === transaction && call.where.cartId === 55));
  assert.deepEqual(destroyed.map((call) => call.where.bookId).sort((a, b) => a - b), [101, 102, 103]);
  assert.deepEqual(destroyed.map((call) => call.where.format), ['ebook', 'print', 'ebook']);
  assert.equal(destroyed.some((call) => call.where.bookId === 999), false);
  assert.deepEqual(entitlements.map(({ values }) => values.resourceId).sort((a, b) => a - b), [101, 103]);
  assert.ok(entitlements.every(({ options }) => options.transaction === transaction));
});

test('reconciliation settles a paid session when the webhook never arrived', async (context) => {
  const order = fakeOrder();
  patchModels(context, { order });
  const fakeStripe = {
    checkout: { sessions: { retrieve: async () => paidSession() } }
  };
  const result = await reconcileOrderWithStripe(order, null, fakeStripe);
  assert.equal(result.reconciled, true);
  assert.equal(order.status, 'fulfilled');
  assert.ok(order.updates.some((entry) => entry.status === 'paid'));
});