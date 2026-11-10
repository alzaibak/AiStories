const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');
const migration = require('../migrations/013-align-email-challenge-roles');

test('la migration aligne les rôles des codes e-mail sur les rôles de compte', async () => {
  const calls = [];
  const queryInterface = {
    async showAllTables() {
      return ['users', 'email_auth_challenges'];
    },
    async changeColumn(...args) {
      calls.push(args);
    }
  };

  await migration.up({ queryInterface, Sequelize });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'email_auth_challenges');
  assert.equal(calls[0][1], 'role');
  assert.deepEqual(calls[0][2].type.values, [
    'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'REVIEWER', 'READER', 'BUYER', 'SELLER'
  ]);
});

test('la migration ne tente pas de modifier une table de codes absente', async () => {
  let changed = false;
  await migration.up({
    queryInterface: {
      async showAllTables() {
        return ['users'];
      },
      async changeColumn() {
        changed = true;
      }
    },
    Sequelize
  });

  assert.equal(changed, false);
});
