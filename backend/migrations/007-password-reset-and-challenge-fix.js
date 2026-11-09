async function up({ queryInterface, Sequelize }) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table.toLowerCase() : String(Object.values(table)[0]).toLowerCase()
  );
  if (!tables.includes('email_auth_challenges')) return;

  const columns = await queryInterface.describeTable('email_auth_challenges');
  if (!columns.deletedAt) {
    await queryInterface.addColumn('email_auth_challenges', 'deletedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
  }

  await queryInterface.changeColumn('email_auth_challenges', 'purpose', {
    type: Sequelize.ENUM('REGISTER', 'ADMIN_REGISTER', 'ADMIN_LOGIN', 'VERIFY_EMAIL', 'PASSWORD_RESET'),
    allowNull: false
  });
}

async function down() {
  throw new Error('La migration de réinitialisation du mot de passe ne peut pas être rétrogradée sans invalider les codes actifs.');
}

module.exports = { up, down };
