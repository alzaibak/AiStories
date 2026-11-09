const test = require('node:test');
const assert = require('node:assert/strict');
const { syncMissingBaseTables, recordMigration } = require('../migrate');
const {
  addIndexIfMissing,
  normalizeLegacyUserIndexes
} = require('../migrations/001-create-tendering-schema');
const { removeForeignKeysForColumn } = require('../migrations/003-remove-commerce-schema');

test('ne resynchronise pas les tables de base déjà présentes', async () => {
  const syncCalls = [];
  const models = ['users', 'categories', 'products'].map((tableName) => ({
    getTableName: () => tableName,
    async sync() {
      syncCalls.push(tableName);
    }
  }));
  const queryInterface = {
    async showAllTables() {
      return ['organizations', 'users', 'categories', 'products'];
    }
  };

  await syncMissingBaseTables(models, queryInterface);

  assert.deepEqual(syncCalls, []);
});

test('crée uniquement les tables de base d’histoires absentes', async () => {
  const syncCalls = [];
  const models = ['users', 'categories', 'products'].map((tableName) => ({
    getTableName: () => tableName,
    async sync() {
      syncCalls.push(tableName);
    }
  }));
  const queryInterface = {
    async showAllTables() {
      return ['organizations', 'users', 'categories'];
    }
  };

  await syncMissingBaseTables(models, queryInterface);

  assert.deepEqual(syncCalls, ['products']);
});

test('enregistre une migration avec executedAt lorsque la table existante l’exige', async () => {
  const calls = [];
  const sequelize = {
    async query(...args) {
      calls.push(args);
    }
  };
  const queryInterface = {
    async describeTable(table) {
      assert.equal(table, 'SequelizeMeta');
      return {
        name: { allowNull: false },
        executedAt: { allowNull: false, defaultValue: null }
      };
    }
  };

  await recordMigration(sequelize, queryInterface, 'SequelizeMeta', '001-create-tendering-schema.js');

  assert.match(calls[0][0], /INSERT INTO SequelizeMeta \(name, executedAt\) VALUES \(\?, \?\)/);
  assert.equal(calls[0][1].replacements[0], '001-create-tendering-schema.js');
  assert.ok(calls[0][1].replacements[1] instanceof Date);
});

test('ajoute les index produits manquants sans dupliquer les index existants', async () => {
  const indexes = [{ name: 'products_category_id' }];
  const addedIndexes = [];
  const queryInterface = {
    async showIndex() {
      return indexes;
    },
    async addIndex(table, fields, options) {
      addedIndexes.push({ table, fields, name: options.name });
      indexes.push({ name: options.name });
    }
  };

  await addIndexIfMissing(
    queryInterface,
    'products',
    ['sellerOrgId', 'genericName'],
    'products_seller_org_id_generic_name'
  );
  await addIndexIfMissing(queryInterface, 'products', ['categoryId'], 'products_category_id');

  assert.deepEqual(addedIndexes, [{
    table: 'products',
    fields: ['sellerOrgId', 'genericName'],
    name: 'products_seller_org_id_generic_name'
  }]);
});

test('supprime uniquement les index e-mail dupliqués et les anciennes unicités de nom', async () => {
  const indexes = [
    { name: 'PRIMARY', unique: true, fields: [{ attribute: 'id' }] },
    { name: 'email', unique: true, fields: [{ attribute: 'email' }] },
    { name: 'email_2', unique: true, fields: [{ attribute: 'email' }] },
    { name: 'email_3', unique: true, fields: [{ attribute: 'email' }] },
    { name: 'firstName_2', unique: true, fields: [{ attribute: 'firstName' }] },
    { name: 'lastName_2', unique: true, fields: [{ attribute: 'lastName' }] },
    { name: 'users_status_idx', unique: false, fields: [{ attribute: 'status' }] },
    { name: 'users_email_created_idx', unique: true, fields: [
      { attribute: 'email' },
      { attribute: 'createdAt' }
    ] }
  ];
  const removed = [];
  const queryInterface = {
    async showIndex() {
      return indexes;
    },
    async removeIndex(table, name) {
      removed.push({ table, name });
    }
  };

  await normalizeLegacyUserIndexes(queryInterface);

  assert.deepEqual(removed, [
    { table: 'users', name: 'email_2' },
    { table: 'users', name: 'email_3' },
    { table: 'users', name: 'firstName_2' },
    { table: 'users', name: 'lastName_2' }
  ]);
});

test('retire seulement les anciennes clés étrangères du vendeur avant modification', async () => {
  const removed = [];
  const queryInterface = {
    async getForeignKeyReferencesForTable(table) {
      assert.equal(table, 'products');
      return [
        { columnName: 'sellerOrgId', constraintName: 'products_sellerOrgId_foreign_idx' },
        { columnName: 'categoryId', constraintName: 'products_categoryId_foreign_idx' }
      ];
    },
    async removeConstraint(table, constraintName) {
      removed.push({ table, constraintName });
    }
  };

  await removeForeignKeysForColumn(queryInterface, 'products', 'sellerOrgId');

  assert.deepEqual(removed, [{
    table: 'products',
    constraintName: 'products_sellerOrgId_foreign_idx'
  }]);
});
