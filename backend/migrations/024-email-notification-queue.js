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

async function up({ queryInterface, Sequelize }) {
  await addColumnIfMissing(queryInterface, 'scheduled_reminders', 'preferenceCategory', {
    type: Sequelize.ENUM('reminders', 'marketing', 'transactional'),
    allowNull: false,
    defaultValue: 'reminders'
  });
  await addColumnIfMissing(queryInterface, 'scheduled_reminders', 'dedupeKey', {
    type: Sequelize.STRING(255),
    allowNull: true,
    unique: true
  });
}

async function down({ queryInterface }) {
  if (!await tableExists(queryInterface, 'scheduled_reminders')) return;
  const columns = await queryInterface.describeTable('scheduled_reminders');
  for (const column of ['dedupeKey', 'preferenceCategory']) {
    if (columns[column]) await queryInterface.removeColumn('scheduled_reminders', column);
  }
}

module.exports = { up, down };
