async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function addColumnIfMissing(queryInterface, table, column, definition) {
  if (!await tableExists(queryInterface, table)) return false;
  const columns = await queryInterface.describeTable(table);
  if (columns[column]) return false;
  await queryInterface.addColumn(table, column, definition);
  return true;
}

async function up({ queryInterface, Sequelize }) {
  const addedCount = await addColumnIfMissing(queryInterface, 'entitlements', 'downloadCount', {
    type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
  });
  await addColumnIfMissing(queryInterface, 'entitlements', 'downloadLimit', {
    type: Sequelize.INTEGER, allowNull: true
  });

  // Purchased e-books get a finite quota; rentals and subscription access stay
  // unlimited (`downloadLimit` NULL), which keeps existing behaviour for them.
  if (addedCount || await tableExists(queryInterface, 'entitlements')) {
    await queryInterface.sequelize.query(`
      UPDATE entitlements
      SET downloadLimit = ?
      WHERE downloadLimit IS NULL
        AND source = 'purchase'
        AND resourceType IN ('book', 'ebook')
    `, { replacements: [5] });
  }
}

async function down({ queryInterface }) {
  if (!await tableExists(queryInterface, 'entitlements')) return;
  const columns = await queryInterface.describeTable('entitlements');
  if (columns.downloadLimit) await queryInterface.removeColumn('entitlements', 'downloadLimit');
  if (columns.downloadCount) await queryInterface.removeColumn('entitlements', 'downloadCount');
}

module.exports = { up, down };
