async function up({ queryInterface, Sequelize }) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table.toLowerCase() : String(Object.values(table)[0]).toLowerCase()
  );
  if (!tables.includes('email_auth_challenges')) return;

  await queryInterface.changeColumn('email_auth_challenges', 'role', {
    type: Sequelize.ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'REVIEWER', 'READER', 'BUYER', 'SELLER'),
    allowNull: false
  });
}

async function down() {
  throw new Error('La migration des rôles des codes e-mail ne peut pas être rétrogradée sans invalider des codes actifs.');
}

module.exports = { up, down };
