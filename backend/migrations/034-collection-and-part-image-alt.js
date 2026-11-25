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
 * Localized alt text for collection banners and story-part illustrations.
 * Collections already had coverAlt; banners need their own description, and
 * part illustrations had no accessible label at all.
 */
async function up({ queryInterface, Sequelize }) {
  await addColumnIfMissing(queryInterface, 'collections', 'bannerAlt', {
    type: Sequelize.JSON,
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'story_parts', 'illustrationAlt', {
    type: Sequelize.JSON,
    allowNull: true
  });
}

async function down({ queryInterface }) {
  for (const [table, column] of [['collections', 'bannerAlt'], ['story_parts', 'illustrationAlt']]) {
    if (!await tableExists(queryInterface, table)) continue;
    const columns = await queryInterface.describeTable(table);
    if (columns[column]) await queryInterface.removeColumn(table, column);
  }
}

module.exports = { up, down };
