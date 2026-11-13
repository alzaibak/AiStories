const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  getClientAppUrl,
  getInvoiceSubscriptionId,
  mapStripeSubscriptionStatus,
  toMinorUnits
} = require('../utils/stripe');
const {
  adminSubscriptionUpdateSchema,
  bookCheckoutSchema,
  donationCheckoutSchema,
  planSchema,
  planUpdateSchema,
  promoCodeSchema,
  subscriptionCheckoutSchema
} = require('../middleware/storyValidation');
const { localizePlan } = require('../utils/planLocalization');

test('Stripe prices are converted to currency minor units without rounding invalid decimals', () => {
  assert.equal(toMinorUnits('12.34', 'EUR'), 1234);
  assert.equal(toMinorUnits('0', 'EUR', { allowZero: true }), 0);
  assert.throws(() => toMinorUnits('12.345', 'EUR'), /positive amount/);
  assert.throws(() => toMinorUnits('-1.00', 'EUR'), /positive amount/);
});

test('donation and promotion schemas accept monthly donations and reject invalid discounts', () => {
  assert.equal(donationCheckoutSchema.safeParse({ amount: 5, recurring: true, language: 'ar' }).success, true);
  assert.equal(donationCheckoutSchema.safeParse({ amount: 5, recurring: 'monthly' }).success, false);
  assert.equal(promoCodeSchema.safeParse({
    code: 'READ10',
    kind: 'percentage',
    appliesTo: 'plans',
    value: 10,
    currency: 'EUR',
    isActive: true
  }).success, true);
  assert.equal(promoCodeSchema.safeParse({
    code: 'TOO-MUCH',
    kind: 'percentage',
    value: 101
  }).success, false);
  assert.equal(promoCodeSchema.safeParse({
    code: 'GIFT30',
    kind: 'gift',
    appliesTo: 'plans',
    value: 0,
    giftPlanId: 2,
    giftDurationDays: 30
  }).success, true);
  assert.equal(promoCodeSchema.safeParse({
    code: 'GIFT30',
    kind: 'gift',
    value: 0
  }).success, false);
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
    interval: 'month',
    translations: {
      ar: { name: 'عائلية', features: ['قراءة غير محدودة'] },
      en: { name: 'Family', features: ['Unlimited reading'] },
      fr: { name: 'Famille', features: ['Lecture illimitée'] }
    }
  }).success, true);
  assert.equal(planSchema.safeParse({
    name: 'Family',
    slug: 'family',
    price: 4.99,
    interval: 'month'
  }).success, false);
  assert.equal(planUpdateSchema.safeParse({}).success, false);
  assert.equal(adminSubscriptionUpdateSchema.safeParse({}).success, false);
});

test('plans are returned only in the selected manually entered language', () => {
  const plan = {
    id: 2,
    name: 'الخطة العائلية',
    features: ['قراءة القصص'],
    translations: {
      en: { name: 'Family plan', features: ['Read all stories'] },
      fr: { name: 'Offre famille', features: ['Lire toutes les histoires'] }
    }
  };
  assert.equal(localizePlan(plan, 'ar').name, 'الخطة العائلية');
  assert.deepEqual(localizePlan(plan, 'en').features, ['Read all stories']);
  assert.deepEqual(localizePlan(plan, 'fr').features, ['Lire toutes les histoires']);
  assert.equal(localizePlan(plan, 'en').translations, undefined);
  assert.equal(localizePlan({ ...plan, translations: {} }, 'fr'), null);
});

test('the built-in sample ebook is a PDF fixture', () => {
  const fixture = path.join(__dirname, '..', 'assets', 'sample-ebook.pdf');
  assert.equal(fs.readFileSync(fixture).subarray(0, 5).toString('ascii'), '%PDF-');
});

test('plan translations migration adds a nullable JSON field only once', async () => {
  const migration = require('../migrations/015-add-plan-translations');
  const columns = {};
  const calls = [];
  const queryInterface = {
    showAllTables: async () => ['plans'],
    describeTable: async () => columns,
    addColumn: async (table, column, definition) => {
      calls.push(['add', table, column, definition]);
      columns[column] = {};
    },
    removeColumn: async (table, column) => {
      calls.push(['remove', table, column]);
      delete columns[column];
    },
    sequelize: { query: async (sql) => calls.push(['query', sql]) }
  };
  await migration.up({ queryInterface, Sequelize: { JSON: 'JSON' } });
  await migration.up({ queryInterface, Sequelize: { JSON: 'JSON' } });
  assert.deepEqual(calls.filter(([kind]) => kind === 'add').map(([, table, column]) => [table, column]), [['plans', 'translations']]);
  assert.equal(calls.filter(([kind]) => kind === 'query').length, 2);
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

test('recurring donation migration creates its table and resumes safely', async () => {
  const migration = require('../migrations/023-recurring-donations');
  const tables = new Set(['donations']);
  const columns = { donations: {} };
  const calls = [];
  const queryInterface = {
    showAllTables: async () => [...tables],
    describeTable: async (table) => columns[table],
    createTable: async (table, definition) => {
      calls.push(['createTable', table, definition]);
      tables.add(table);
      columns[table] = Object.fromEntries(Object.keys(definition).map((column) => [column, {}]));
    },
    addColumn: async (table, column, definition) => {
      calls.push(['addColumn', table, column, definition]);
      columns[table][column] = {};
    }
  };
  const Sequelize = {
    INTEGER: 'INTEGER',
    STRING: (length) => `STRING(${length})`,
    DECIMAL: (precision, scale) => `DECIMAL(${precision},${scale})`,
    ENUM: (...values) => values,
    BOOLEAN: 'BOOLEAN',
    DATE: 'DATE',
    fn: (value) => value
  };

  await migration.up({ queryInterface, Sequelize });
  await migration.up({ queryInterface, Sequelize });
  assert.equal(calls.filter(([kind]) => kind === 'createTable').length, 1);
  assert.deepEqual(calls.filter(([kind]) => kind === 'addColumn').map(([, table, column]) => [table, column]), [
    ['donations', 'recurringDonationId'],
    ['donations', 'stripeInvoiceId']
  ]);
});
