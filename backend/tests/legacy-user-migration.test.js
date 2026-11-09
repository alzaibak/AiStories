const test = require('node:test');
const assert = require('node:assert/strict');
const CryptoJS = require('crypto-js');
const migration = require('../migrations/004-remove-legacy-user-fields');
const { verifyPassword } = require('../utils/security');

test('la migration convertit les anciens mots de passe avant de supprimer les colonnes héritées', async () => {
  const previousSecret = process.env.SECRET_PASSWORD;
  const legacyPassword = 'ancien-mot-de-passe';
  const encryptedPassword = CryptoJS.AES.encrypt(legacyPassword, 'migration-test-secret').toString();
  const removedColumns = [];
  let convertedHash;
  process.env.SECRET_PASSWORD = 'migration-test-secret';

  const queryInterface = {
    describeTable: async () => ({
      password: {},
      passwordHash: {},
      subscribe: {},
      isAdmin: {}
    }),
    changeColumn: async () => {},
    removeColumn: async (_table, column) => removedColumns.push(column),
    sequelize: {
      query: async (sql, options) => {
        if (sql.startsWith('SELECT id, password')) {
          return [{ id: 42, password: encryptedPassword }];
        }
        if (sql.startsWith('UPDATE users SET passwordHash')) {
          convertedHash = options.replacements[0];
          return [[], {}];
        }
        if (sql.startsWith('SELECT COUNT(*)')) return [[{ count: 0 }], {}];
        throw new Error(`Requête inattendue dans le test : ${sql}`);
      }
    }
  };

  try {
    await migration.up({
      queryInterface,
      Sequelize: { STRING: (length) => ({ type: 'STRING', length }), QueryTypes: { SELECT: 'SELECT' } }
    });
  } finally {
    if (previousSecret === undefined) delete process.env.SECRET_PASSWORD;
    else process.env.SECRET_PASSWORD = previousSecret;
  }

  assert.equal(await verifyPassword(legacyPassword, convertedHash), true);
  assert.deepEqual(removedColumns, ['password', 'subscribe', 'isAdmin']);
});
