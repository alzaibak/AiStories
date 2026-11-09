const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');
const migration = require('../migrations/007-password-reset-and-challenge-fix');

test('répare les défis existants pour paranoid et ajoute la finalité de réinitialisation', async () => {
  const calls = [];
  const queryInterface = {
    async showAllTables() {
      return ['email_auth_challenges'];
    },
    async describeTable(table) {
      assert.equal(table, 'email_auth_challenges');
      return { purpose: {}, consumedAt: {} };
    },
    async addColumn(...args) {
      calls.push(['addColumn', ...args]);
    },
    async changeColumn(...args) {
      calls.push(['changeColumn', ...args]);
    }
  };

  await migration.up({ queryInterface, Sequelize });

  assert.ok(calls.some(([method, table, column, definition]) =>
    method === 'addColumn' && table === 'email_auth_challenges' &&
    column === 'deletedAt' && definition.allowNull
  ));
  const purpose = calls.find(([method, table, column]) =>
    method === 'changeColumn' && table === 'email_auth_challenges' && column === 'purpose'
  )[3];
  assert.deepEqual(purpose.type.values, [
    'REGISTER', 'ADMIN_REGISTER', 'ADMIN_LOGIN', 'VERIFY_EMAIL', 'PASSWORD_RESET'
  ]);
});

test('ignore les bases où la table de codes n’existe pas encore', async () => {
  const queryInterface = {
    async showAllTables() {
      return ['users'];
    },
    async describeTable() {
      assert.fail('Aucune table ne doit être modifiée');
    }
  };

  await migration.up({ queryInterface, Sequelize });
});
