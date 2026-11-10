async function up({ queryInterface }) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table.toLowerCase() : String(Object.values(table)[0]).toLowerCase()
  );
  if (!tables.includes('users')) return;

  await queryInterface.sequelize.query(
    "UPDATE users SET role = 'READER' WHERE role = 'BUYER'"
  );
}

async function down() {
  throw new Error('La migration des anciens comptes lecteurs ne peut pas être annulée sans restaurer les rôles manuellement.');
}

module.exports = { up, down };
