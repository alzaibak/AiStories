async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function addColumnIfMissing(queryInterface, table, column, definition) {
  if (!await tableExists(queryInterface, table)) return;
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) await queryInterface.addColumn(table, column, definition);
}

async function removeColumnIfPresent(queryInterface, table, column) {
  if (!await tableExists(queryInterface, table)) return;
  const columns = await queryInterface.describeTable(table);
  if (columns[column]) await queryInterface.removeColumn(table, column);
}

async function up({ queryInterface, Sequelize }) {
  await addColumnIfMissing(queryInterface, 'mystery_boxes', 'earlyBirdPrice', {
    type: Sequelize.DECIMAL(10, 2), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'mystery_boxes', 'compareAtValue', {
    type: Sequelize.DECIMAL(10, 2), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'mystery_box_items', 'estimatedValue', {
    type: Sequelize.DECIMAL(10, 2), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'mystery_box_shipping', 'freeShippingThreshold', {
    type: Sequelize.DECIMAL(10, 2), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'mystery_box_appearance', 'almostSoldOutThreshold', {
    type: Sequelize.INTEGER, allowNull: true
  });
  // The shared attribute object created a stray `price` column on items and
  // shipping instead of the intended money columns.
  await removeColumnIfPresent(queryInterface, 'mystery_box_items', 'price');
  await removeColumnIfPresent(queryInterface, 'mystery_box_shipping', 'price');
}

async function down({ queryInterface }) {
  for (const [table, column] of [
    ['mystery_box_appearance', 'almostSoldOutThreshold'],
    ['mystery_box_shipping', 'freeShippingThreshold'],
    ['mystery_box_items', 'estimatedValue'],
    ['mystery_boxes', 'compareAtValue'],
    ['mystery_boxes', 'earlyBirdPrice']
  ]) {
    await removeColumnIfPresent(queryInterface, table, column);
  }
}

module.exports = { up, down };
