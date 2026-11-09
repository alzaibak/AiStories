const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../migrations/008-remove-duplicate-email-auth-challenges');

test('supprime les défis en doublon avec la transaction fournie par Sequelize', async () => {
  const calls = [];
  const transaction = {
    async commit() {
      calls.push('commit');
    },
    async rollback() {
      calls.push('rollback');
    }
  };
  const queryInterface = {
    sequelize: {
      async transaction() {
        calls.push('transaction');
        return transaction;
      },
      async query(sql, options) {
        calls.push({ sql, options });
      }
    }
  };

  await migration.up({ queryInterface });

  assert.equal(calls[0], 'transaction');
  assert.match(calls[1].sql, /DELETE e1 FROM email_auth_challenges e1/);
  assert.equal(calls[1].options.transaction, transaction);
  assert.equal(calls[2], 'commit');
});

test('annule la transaction et propage l’erreur SQL', async () => {
  const failure = new Error('database failure');
  const calls = [];
  const queryInterface = {
    sequelize: {
      async transaction() {
        return {
          async commit() {
            calls.push('commit');
          },
          async rollback() {
            calls.push('rollback');
          }
        };
      },
      async query() {
        throw failure;
      }
    }
  };

  await assert.rejects(migration.up({ queryInterface }), failure);
  assert.deepEqual(calls, ['rollback']);
});
