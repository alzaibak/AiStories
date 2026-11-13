const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../migrations/022-promotions-and-event-announcements');

test('promotion migration rollback preserves existing email templates', async () => {
  const calls = [];
  const tables = [
    'store_orders',
    'community_events',
    'promo_codes',
    'promo_code_redemptions',
    'email_templates'
  ];
  const queryInterface = {
    showAllTables: async () => tables,
    describeTable: async (table) => ({
      store_orders: { discountAmount: {} },
      community_events: { winnerDisplayName: {}, winnerAnnouncement: {} }
    }[table] || {}),
    removeColumn: async (...args) => calls.push(['removeColumn', ...args]),
    dropTable: async (...args) => calls.push(['dropTable', ...args]),
    bulkDelete: async (...args) => calls.push(['bulkDelete', ...args])
  };

  await migration.down({ queryInterface });

  assert.equal(calls.some(([kind]) => kind === 'bulkDelete'), false);
  assert.deepEqual(calls.filter(([kind]) => kind === 'dropTable').map(([, table]) => table), [
    'promo_code_redemptions',
    'promo_codes'
  ]);
});
