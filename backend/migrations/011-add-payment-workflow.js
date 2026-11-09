async function addColumnIfMissing(queryInterface, table, column, definition) {
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) await queryInterface.addColumn(table, column, definition);
}

async function removeColumnIfPresent(queryInterface, table, column) {
  const columns = await queryInterface.describeTable(table);
  if (columns[column]) await queryInterface.removeColumn(table, column);
}

async function up({ queryInterface, Sequelize }) {
  await addColumnIfMissing(queryInterface, 'users', 'stripeCustomerId', {
    type: Sequelize.STRING(255),
    allowNull: true,
    unique: true
  });
  await addColumnIfMissing(queryInterface, 'store_orders', 'shippingAddress', {
    type: Sequelize.JSON,
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'store_orders', 'fulfillmentStatus', {
    type: Sequelize.ENUM('unfulfilled', 'processing', 'shipped', 'delivered'),
    allowNull: false,
    defaultValue: 'unfulfilled'
  });
  await addColumnIfMissing(queryInterface, 'store_orders', 'trackingNumber', {
    type: Sequelize.STRING(255),
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'subscriptions', 'stripeCheckoutSessionId', {
    type: Sequelize.STRING(255),
    allowNull: true,
    unique: true
  });
  await addColumnIfMissing(queryInterface, 'entitlements', 'orderItemId', {
    type: Sequelize.INTEGER,
    allowNull: true,
    unique: true,
    references: { model: 'store_order_items', key: 'id' },
    onDelete: 'SET NULL'
  });
}

async function down({ queryInterface }) {
  await removeColumnIfPresent(queryInterface, 'entitlements', 'orderItemId');
  await removeColumnIfPresent(queryInterface, 'subscriptions', 'stripeCheckoutSessionId');
  await removeColumnIfPresent(queryInterface, 'store_orders', 'trackingNumber');
  await removeColumnIfPresent(queryInterface, 'store_orders', 'fulfillmentStatus');
  await removeColumnIfPresent(queryInterface, 'store_orders', 'shippingAddress');
  await removeColumnIfPresent(queryInterface, 'users', 'stripeCustomerId');
}

module.exports = { up, down };
