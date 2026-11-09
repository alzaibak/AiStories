async function up({ queryInterface, Sequelize }) {
  const columns = await queryInterface.describeTable('tenders');
  if (!columns.sealedOffers) {
    await queryInterface.addColumn('tenders', 'sealedOffers', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  }
}

async function down({ queryInterface }) {
  const columns = await queryInterface.describeTable('tenders');
  if (columns.sealedOffers) {
    await queryInterface.removeColumn('tenders', 'sealedOffers');
  }
}

module.exports = { up, down };
