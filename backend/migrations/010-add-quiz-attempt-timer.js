async function up({ queryInterface, Sequelize }) {
  const columns = await queryInterface.describeTable('quiz_attempts');
  if (!columns.startedAt) {
    await queryInterface.addColumn('quiz_attempts', 'startedAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    });
  }
  await queryInterface.changeColumn('quiz_attempts', 'score', {
    type: Sequelize.INTEGER,
    allowNull: true
  });
}

async function down({ queryInterface, Sequelize }) {
  await queryInterface.sequelize.query(
    'DELETE FROM quiz_attempts WHERE score IS NULL'
  );
  const columns = await queryInterface.describeTable('quiz_attempts');
  if (columns.startedAt) await queryInterface.removeColumn('quiz_attempts', 'startedAt');
  await queryInterface.changeColumn('quiz_attempts', 'score', {
    type: Sequelize.INTEGER,
    allowNull: false
  });
}

module.exports = { up, down };
