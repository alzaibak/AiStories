async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function up({ queryInterface, Sequelize }) {
  if (!await tableExists(queryInterface, 'mystery_boxes')) return;
  const columns = await queryInterface.describeTable('mystery_boxes');
  if (!columns.digitalConsentText) {
    await queryInterface.addColumn('mystery_boxes', 'digitalConsentText', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  }
}

async function down({ queryInterface }) {
  if (!await tableExists(queryInterface, 'mystery_boxes')) return;
  const columns = await queryInterface.describeTable('mystery_boxes');
  if (columns.digitalConsentText) await queryInterface.removeColumn('mystery_boxes', 'digitalConsentText');
}

module.exports = { up, down };
