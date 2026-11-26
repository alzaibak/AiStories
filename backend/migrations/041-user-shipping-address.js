async function columnExists(queryInterface, table, column) {
  const description = await queryInterface.describeTable(table);
  return Boolean(description[column]);
}

/**
 * The reader's own delivery address, saved from "Mon compte" and reused by the
 * cart before payment. Null means "never saved": the cart then falls back to the
 * address of the last physical order.
 */
module.exports = {
  async up({ queryInterface, Sequelize }) {
    if (await columnExists(queryInterface, 'users', 'shippingAddress')) return;
    await queryInterface.addColumn('users', 'shippingAddress', {
      type: Sequelize.JSON,
      allowNull: true
    });
  },

  async down({ queryInterface }) {
    if (!await columnExists(queryInterface, 'users', 'shippingAddress')) return;
    await queryInterface.removeColumn('users', 'shippingAddress');
  }
};
