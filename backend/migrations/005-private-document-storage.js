async function up({ queryInterface, Sequelize }) {
  const columns = await queryInterface.describeTable('documents');
  if (!columns.storageKey) {
    await queryInterface.addColumn('documents', 'storageKey', {
      type: Sequelize.STRING(1024),
      allowNull: true
    });
  }
  if (!columns.uploadedAt) {
    await queryInterface.addColumn('documents', 'uploadedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
  }
  await queryInterface.changeColumn('documents', 'fileUrl', {
    type: Sequelize.STRING(1000),
    allowNull: true
  });
}

async function down() {
  throw new Error('Les clés et métadonnées de stockage privé ne peuvent pas être rétrogradées sans perte de documents.');
}

module.exports = { up, down };
