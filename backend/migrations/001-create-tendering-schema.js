const models = require('../models');

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await queryInterface.describeTable(tableName);
  if (!columns[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function addIndexIfMissing(queryInterface, tableName, fields, name) {
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(tableName, fields, { name });
  }
}

async function normalizeLegacyUserIndexes(queryInterface) {
  const indexes = await queryInterface.showIndex('users');
  const singleColumnIndexes = indexes.filter((index) =>
    index.fields?.length === 1
  );
  const emailIndexes = singleColumnIndexes.filter((index) =>
    index.unique && index.fields[0].attribute === 'email'
  );
  const canonicalEmailIndex = emailIndexes.find((index) => index.name === 'email') || emailIndexes[0];

  for (const index of emailIndexes) {
    if (index !== canonicalEmailIndex) await queryInterface.removeIndex('users', index.name);
  }

  for (const index of singleColumnIndexes) {
    if (index.unique && ['firstName', 'lastName'].includes(index.fields[0].attribute)) {
      await queryInterface.removeIndex('users', index.name);
    }
  }
}

async function up({ queryInterface, Sequelize }) {
  await models.Organization.sync();
  await normalizeLegacyUserIndexes(queryInterface);

  const userColumns = [
    ['passwordHash', { type: Sequelize.STRING(255), allowNull: true }],
    ['role', { type: Sequelize.ENUM('ADMIN', 'BUYER', 'SELLER'), allowNull: false, defaultValue: 'BUYER' }],
    ['organizationId', {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'organizations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
    }],
    ['language', { type: Sequelize.ENUM('fr', 'en', 'ar'), allowNull: false, defaultValue: 'fr' }],
    ['status', { type: Sequelize.ENUM('ACTIVE', 'PENDING', 'SUSPENDED'), allowNull: false, defaultValue: 'ACTIVE' }],
    ['twoFactorEnabled', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }]
  ];
  for (const [name, definition] of userColumns) {
    await addColumnIfMissing(queryInterface, 'users', name, definition);
  }
  const existingUserColumns = await queryInterface.describeTable('users');
  if (existingUserColumns.isAdmin) {
    await queryInterface.sequelize.query("UPDATE users SET role = 'ADMIN' WHERE isAdmin = 1");
  }

  const productColumns = [
    ['sellerOrgId', {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'organizations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
    }],
    ['genericName', { type: Sequelize.STRING(255), allowNull: true }],
    ['dosage', { type: Sequelize.STRING(120), allowNull: true }],
    ['dosageForm', { type: Sequelize.STRING(120), allowNull: true }],
    ['packaging', { type: Sequelize.STRING(255), allowNull: true }],
    ['manufacturer', { type: Sequelize.STRING(255), allowNull: true }],
    ['originCountry', { type: Sequelize.STRING(120), allowNull: true }],
    ['marketingAuthorization', {
      type: Sequelize.ENUM('APPROVED', 'PENDING', 'NOT_REQUIRED', 'REJECTED'), allowNull: true
    }],
    ['therapeuticClasses', { type: Sequelize.JSON, allowNull: false, defaultValue: [] }],
    ['rcpUrl', { type: Sequelize.STRING(1000), allowNull: true }],
    ['rcpLanguage', { type: Sequelize.ENUM('fr', 'en', 'ar'), allowNull: true }],
    ['rcpUpdatedAt', { type: Sequelize.DATE, allowNull: true }],
    ['deletedAt', { type: Sequelize.DATE, allowNull: true }]
  ];
  for (const [name, definition] of productColumns) {
    await addColumnIfMissing(queryInterface, 'products', name, definition);
  }
  await addIndexIfMissing(queryInterface, 'products', ['sellerOrgId', 'genericName'], 'products_seller_org_id_generic_name');
  await addIndexIfMissing(queryInterface, 'products', ['categoryId'], 'products_category_id');

  await models.Tender.sync();
  await models.TenderItem.sync();
  await models.TenderInvitation.sync();
  await models.Offer.sync();
  await models.OfferItem.sync();
  await models.Document.sync();
  await models.Clarification.sync();
  await models.Message.sync();
  await models.PurchaseOrder.sync();
  await models.AuditLog.sync();
}

async function down({ queryInterface }) {
  for (const table of [
    'audit_logs', 'purchase_orders', 'messages', 'clarifications',
    'documents', 'offer_items', 'offers', 'tender_invitations',
    'tender_items', 'tenders'
  ]) {
    await queryInterface.dropTable(table);
  }
  for (const [tableName, columns] of Object.entries({
    products: [
      'sellerOrgId', 'genericName', 'dosage', 'dosageForm', 'packaging',
      'manufacturer', 'originCountry', 'marketingAuthorization',
      'therapeuticClasses', 'rcpUrl', 'rcpLanguage', 'rcpUpdatedAt', 'deletedAt'
    ],
    users: ['passwordHash', 'role', 'organizationId', 'language', 'status', 'twoFactorEnabled']
  })) {
    const existing = await queryInterface.describeTable(tableName);
    for (const column of columns) {
      if (existing[column]) await queryInterface.removeColumn(tableName, column);
    }
  }
  await queryInterface.dropTable('organizations');
}

module.exports = { up, down, addIndexIfMissing, normalizeLegacyUserIndexes };
