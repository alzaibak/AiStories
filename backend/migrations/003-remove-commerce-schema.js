async function removeForeignKeysForColumn(queryInterface, tableName, columnName) {
  const foreignKeys = await queryInterface.getForeignKeyReferencesForTable(tableName);
  for (const foreignKey of foreignKeys) {
    if (foreignKey.columnName.toLowerCase() === columnName.toLowerCase()) {
      await queryInterface.removeConstraint(tableName, foreignKey.constraintName);
    }
  }
}

async function up({ queryInterface, Sequelize }) {
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table.toLowerCase() : String(Object.values(table)[0]).toLowerCase()
  );
  for (const table of ['order_items', 'orders', 'carts']) {
    if (existingTables.includes(table)) await queryInterface.dropTable(table);
  }

  const columns = await queryInterface.describeTable('products');
  const names = Object.keys(columns);
  const findColumn = (name) => names.find((column) => column.toLowerCase() === name.toLowerCase());
  if (!findColumn('tradeName')) {
    await queryInterface.addColumn('products', 'tradeName', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
  }

  if (findColumn('title')) {
    await queryInterface.sequelize.query(
      'UPDATE products SET tradeName = title WHERE tradeName IS NULL AND sellerOrgId IS NOT NULL'
    );
  }
  await queryInterface.sequelize.query(
    'DELETE FROM products WHERE sellerOrgId IS NULL OR tradeName IS NULL OR genericName IS NULL OR dosage IS NULL OR dosageForm IS NULL OR originCountry IS NULL'
  );

  const currentColumns = await queryInterface.describeTable('products');
  await removeForeignKeysForColumn(queryInterface, 'products', 'sellerOrgId');
  for (const [column, definition] of Object.entries({
    sellerOrgId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    tradeName: { type: Sequelize.STRING(255), allowNull: false },
    genericName: { type: Sequelize.STRING(255), allowNull: false },
    dosage: { type: Sequelize.STRING(120), allowNull: false },
    dosageForm: { type: Sequelize.STRING(120), allowNull: false },
    originCountry: { type: Sequelize.STRING(120), allowNull: false }
  })) {
    if (currentColumns[column]) await queryInterface.changeColumn('products', column, definition);
  }

  for (const oldName of ['img', 'price', 'DiscountPrice', 'inStock', 'attributes', 'stockByVariant', 'title']) {
    const column = Object.keys(currentColumns).find((name) => name.toLowerCase() === oldName.toLowerCase());
    if (column) await queryInterface.removeColumn('products', column);
  }
}

async function down() {
  throw new Error('Cette migration supprime irréversiblement les anciennes données commerciales.');
}

module.exports = { up, down, removeForeignKeysForColumn };
