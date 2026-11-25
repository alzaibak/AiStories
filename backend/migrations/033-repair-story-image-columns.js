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

/**
 * Some databases recorded 032-story-images as applied while the JSON columns
 * added later to that file (stories.coverVariants and collections.focalPoint)
 * were never created. Repair them idempotently so the Story model can be
 * selected without ER_BAD_FIELD_ERROR.
 */
async function up({ queryInterface, Sequelize }) {
  await addColumnIfMissing(queryInterface, 'stories', 'coverVariants', {
    type: Sequelize.JSON,
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'collections', 'focalPoint', {
    type: Sequelize.JSON,
    allowNull: true
  });
}

async function down() {
  // Repair-only migration: these columns belong to 032-story-images. Rolling
  // back this file must not drop them, since they may already hold data.
}

module.exports = { up, down };
