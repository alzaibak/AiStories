async function up({ queryInterface, Sequelize }) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table.toLowerCase() : String(Object.values(table)[0]).toLowerCase()
  );
  if (!tables.includes('plans')) return;

  const columns = await queryInterface.describeTable('plans');
  if (!columns.translations) {
    await queryInterface.addColumn('plans', 'translations', {
      type: Sequelize.JSON,
      allowNull: true
    });
  }
  await queryInterface.sequelize.query(
    "UPDATE plans SET translations = JSON_OBJECT('ar', JSON_OBJECT('name', name, 'features', features)) WHERE translations IS NULL"
  );
}

async function down({ queryInterface }) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table.toLowerCase() : String(Object.values(table)[0]).toLowerCase()
  );
  if (!tables.includes('plans')) return;
  const columns = await queryInterface.describeTable('plans');
  if (columns.translations) await queryInterface.removeColumn('plans', 'translations');
}

module.exports = { up, down };
