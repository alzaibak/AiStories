async function up({ queryInterface, Sequelize }) {
  const columns = await queryInterface.describeTable('books');
  if (!columns.translations) {
    await queryInterface.addColumn('books', 'translations', {
      type: Sequelize.JSON,
      allowNull: false,
      defaultValue: {}
    });
  }
}

async function down({ queryInterface }) {
  const columns = await queryInterface.describeTable('books');
  if (columns.translations) await queryInterface.removeColumn('books', 'translations');
}

module.exports = { up, down };
