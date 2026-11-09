const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getClientAppUrl,
  getInvoiceSubscriptionId,
  mapStripeSubscriptionStatus,
  toMinorUnits
} = require('../utils/stripe');
const {
  adminSubscriptionUpdateSchema,
  bookCheckoutSchema,
  planSchema,
  planUpdateSchema,
  subscriptionCheckoutSchema
} = require('../middleware/storyValidation');

test('Stripe prices are converted to currency minor units without rounding invalid decimals', () => {
  assert.equal(toMinorUnits('12.34', 'EUR'), 1234);
  assert.equal(toMinorUnits('0', 'EUR', { allowZero: true }), 0);
  assert.throws(() => toMinorUnits('12.345', 'EUR'), /positive amount/);
  assert.throws(() => toMinorUnits('-1.00', 'EUR'), /positive amount/);
});

test('Stripe subscription states map to persisted subscription states', () => {
  assert.equal(mapStripeSubscriptionStatus('active'), 'active');
  assert.equal(mapStripeSubscriptionStatus('past_due'), 'past_due');
  assert.equal(mapStripeSubscriptionStatus('incomplete_expired'), 'expired');
  assert.throws(() => mapStripeSubscriptionStatus('unknown'), /Unsupported Stripe subscription status/);
});

test('invoice subscription ids support both Stripe invoice representations', () => {
  assert.equal(getInvoiceSubscriptionId({ subscription: 'sub_123' }), 'sub_123');
  assert.equal(getInvoiceSubscriptionId({
    parent: { subscription_details: { subscription: { id: 'sub_456' } } }
  }), 'sub_456');
  assert.equal(getInvoiceSubscriptionId({}), null);
});

test('client checkout URLs must use HTTP or HTTPS and cannot include credentials', () => {
  const previous = process.env.CLIENT_APP_URL;
  try {
    process.env.CLIENT_APP_URL = 'https://stories.example/path';
    assert.equal(getClientAppUrl(), 'https://stories.example');
    process.env.CLIENT_APP_URL = 'javascript:alert(1)';
    assert.throws(() => getClientAppUrl(), /HTTP or HTTPS/);
    process.env.CLIENT_APP_URL = 'https://user:pass@stories.example';
    assert.throws(() => getClientAppUrl(), /credentials/);
  } finally {
    if (previous === undefined) delete process.env.CLIENT_APP_URL;
    else process.env.CLIENT_APP_URL = previous;
  }
});

test('payment schemas reject duplicate books and incomplete manual updates', () => {
  const address = {
    name: 'Reader',
    line1: '12 Book Street',
    city: 'Paris',
    postalCode: '75001',
    country: 'fr',
    phone: '+33123456789'
  };
  const validOrder = bookCheckoutSchema.safeParse({
    items: [{ bookId: 1, quantity: 1 }],
    shippingAddress: address
  });
  assert.equal(validOrder.success, true);
  assert.equal(validOrder.data.language, 'ar');
  assert.equal(validOrder.data.shippingAddress.country, 'FR');
  assert.equal(bookCheckoutSchema.safeParse({
    language: 'en',
    items: [{ bookId: 1, quantity: 1 }]
  }).data.language, 'en');
  assert.equal(bookCheckoutSchema.safeParse({
    language: 'es',
    items: [{ bookId: 1, quantity: 1 }]
  }).success, false);
  assert.equal(subscriptionCheckoutSchema.safeParse({ planId: 1, language: 'fr' }).success, true);
  assert.equal(subscriptionCheckoutSchema.safeParse({ planId: 1, language: 'es' }).success, false);
  assert.equal(bookCheckoutSchema.safeParse({
    items: [{ bookId: 1, quantity: 1 }, { bookId: 1, quantity: 2 }]
  }).success, false);
  assert.equal(planSchema.safeParse({
    name: 'Family',
    slug: 'family',
    price: 4.99,
    interval: 'month'
  }).success, true);
  assert.equal(planUpdateSchema.safeParse({}).success, false);
  assert.equal(adminSubscriptionUpdateSchema.safeParse({}).success, false);
});

test('payment migration adds and removes only payment workflow columns', async () => {
  const migration = require('../migrations/011-add-payment-workflow');
  const calls = [];
  const columns = {
    users: {},
    store_orders: {},
    subscriptions: {},
    entitlements: {}
  };
  const queryInterface = {
    describeTable: async (table) => columns[table],
    addColumn: async (table, column, definition) => {
      calls.push(['add', table, column, definition]);
      columns[table][column] = {};
    },
    removeColumn: async (table, column) => {
      calls.push(['remove', table, column]);
      delete columns[table][column];
    }
  };
  await migration.up({
    queryInterface,
    Sequelize: {
      STRING: () => 'STRING',
      JSON: 'JSON',
      INTEGER: 'INTEGER',
      ENUM: (...values) => values
    }
  });
  assert.deepEqual(calls.map(([action, table, column]) => [action, table, column]), [
    ['add', 'users', 'stripeCustomerId'],
    ['add', 'store_orders', 'shippingAddress'],
    ['add', 'store_orders', 'fulfillmentStatus'],
    ['add', 'store_orders', 'trackingNumber'],
    ['add', 'subscriptions', 'stripeCheckoutSessionId'],
    ['add', 'entitlements', 'orderItemId']
  ]);
  calls.length = 0;
  await migration.down({ queryInterface });
  assert.deepEqual(calls.map(([action, table, column]) => [action, table, column]), [
    ['remove', 'entitlements', 'orderItemId'],
    ['remove', 'subscriptions', 'stripeCheckoutSessionId'],
    ['remove', 'store_orders', 'trackingNumber'],
    ['remove', 'store_orders', 'fulfillmentStatus'],
    ['remove', 'store_orders', 'shippingAddress'],
    ['remove', 'users', 'stripeCustomerId']
  ]);
});

test('payment migration resumes safely when a column already exists', async () => {
  const migration = require('../migrations/011-add-payment-workflow');
  const calls = [];
  const columns = {
    users: { stripeCustomerId: {} },
    store_orders: {},
    subscriptions: {},
    entitlements: {}
  };
  const queryInterface = {
    describeTable: async (table) => columns[table],
    addColumn: async (table, column, definition) => {
      calls.push([table, column, definition]);
      columns[table][column] = {};
    }
  };

  await migration.up({
    queryInterface,
    Sequelize: {
      STRING: () => 'STRING',
      JSON: 'JSON',
      INTEGER: 'INTEGER',
      ENUM: (...values) => values
    }
  });

  assert.deepEqual(calls.map(([table, column]) => [table, column]), [
    ['store_orders', 'shippingAddress'],
    ['store_orders', 'fulfillmentStatus'],
    ['store_orders', 'trackingNumber'],
    ['subscriptions', 'stripeCheckoutSessionId'],
    ['entitlements', 'orderItemId']
  ]);
});
