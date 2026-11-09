async function up({ queryInterface, Sequelize }) {
  const userColumns = await queryInterface.describeTable('users');
  if (!userColumns.emailVerifiedAt) {
    await queryInterface.addColumn('users', 'emailVerifiedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
  }

  await queryInterface.sequelize.query(
    'UPDATE users SET emailVerifiedAt = COALESCE(emailVerifiedAt, CURRENT_TIMESTAMP)'
  );
  await queryInterface.changeColumn('users', 'role', {
    type: Sequelize.ENUM('SUPER_ADMIN', 'ADMIN', 'BUYER', 'SELLER'),
    allowNull: false,
    defaultValue: 'BUYER'
  });

  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table.toLowerCase() : String(Object.values(table)[0]).toLowerCase()
  );
  if (!tables.includes('email_auth_challenges')) {
    await queryInterface.createTable('email_auth_challenges', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false },
      role: { type: Sequelize.ENUM('ADMIN', 'BUYER', 'SELLER'), allowNull: false },
      purpose: { type: Sequelize.ENUM('REGISTER', 'ADMIN_REGISTER', 'ADMIN_LOGIN', 'VERIFY_EMAIL', 'PASSWORD_RESET'), allowNull: false },
      codeHash: { type: Sequelize.STRING(128), allowNull: false },
      failedAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      maxAttempts: { type: Sequelize.INTEGER, allowNull: false },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      resendAvailableAt: { type: Sequelize.DATE, allowNull: false },
      verifiedAt: { type: Sequelize.DATE, allowNull: true },
      consumedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE, allowNull: true }
    });
    await queryInterface.addIndex('email_auth_challenges', ['email', 'purpose'], {
      unique: true,
      name: 'email_auth_challenges_email_purpose_unique'
    });
    await queryInterface.addIndex('email_auth_challenges', ['expiresAt'], {
      name: 'email_auth_challenges_expires_at'
    });
  }
  const challengeColumns = await queryInterface.describeTable('email_auth_challenges');
  if (!challengeColumns.consumedAt) {
    await queryInterface.addColumn('email_auth_challenges', 'consumedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
  }
  if (!challengeColumns.deletedAt) {
    await queryInterface.addColumn('email_auth_challenges', 'deletedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
  }
}

async function down() {
  throw new Error('La migration d’authentification vérifiée ne peut pas être rétrogradée sans invalider les comptes.');
}

module.exports = { up, down };
