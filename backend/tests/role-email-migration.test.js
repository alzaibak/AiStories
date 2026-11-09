const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');
const migration = require('../migrations/006-role-email-authentication');

test('la migration ajoute la vérification e-mail, les rôles et les défis OTP', async () => {
  const calls = [];
  const queryInterface = {
    async describeTable(table) {
      calls.push(['describeTable', table]);
      return {};
    },
    async addColumn(...args) {
      calls.push(['addColumn', ...args]);
    },
    async changeColumn(...args) {
      calls.push(['changeColumn', ...args]);
    },
    async showAllTables() {
      return [];
    },
    sequelize: {
      async query(query) {
        calls.push(['query', query]);
      }
    },
    async createTable(...args) {
      calls.push(['createTable', ...args]);
    },
    async addIndex(...args) {
      calls.push(['addIndex', ...args]);
    }
  };

  await migration.up({ queryInterface, Sequelize });

  const userRole = calls.find(([method, table, column]) =>
    method === 'changeColumn' && table === 'users' && column === 'role'
  )[3];
  assert.deepEqual(userRole.type.values, ['SUPER_ADMIN', 'ADMIN', 'BUYER', 'SELLER']);

  const challengeTable = calls.find(([method, table]) =>
    method === 'createTable' && table === 'email_auth_challenges'
  )[2];
  assert.deepEqual(challengeTable.role.type.values, ['ADMIN', 'BUYER', 'SELLER']);
  assert.deepEqual(challengeTable.purpose.type.values, [
    'REGISTER', 'ADMIN_REGISTER', 'ADMIN_LOGIN', 'VERIFY_EMAIL', 'PASSWORD_RESET'
  ]);
  assert.ok(challengeTable.deletedAt.allowNull);
  assert.ok(calls.some(([method, table, column]) =>
    method === 'addColumn' && table === 'users' && column === 'emailVerifiedAt'
  ));
  assert.ok(calls.some(([method, table, columns]) =>
    method === 'addIndex' && table === 'email_auth_challenges' &&
    columns.join(',') === 'email,purpose'
  ));
  assert.ok(calls.some(([method, table, column]) =>
    method === 'addColumn' && table === 'email_auth_challenges' && column === 'deletedAt'
  ));
});
