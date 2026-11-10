const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../migrations/014-convert-legacy-buyers-to-readers');

test('convertit les anciens acheteurs en lecteurs sans toucher à leurs comptes', async () => {
  const calls = [];
  await migration.up({
    queryInterface: {
      async showAllTables() {
        return ['users'];
      },
      sequelize: {
        async query(...args) {
          calls.push(args);
        }
      }
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "UPDATE users SET role = 'READER' WHERE role = 'BUYER'");
});

test('ignore une base qui ne contient pas encore la table users', async () => {
  let updated = false;
  await migration.up({
    queryInterface: {
      async showAllTables() {
        return ['SequelizeMeta'];
      },
      sequelize: {
        async query() {
          updated = true;
        }
      }
    }
  });

  assert.equal(updated, false);
});
