async function columnExists(queryInterface, table, column) {
  const description = await queryInterface.describeTable(table);
  return Boolean(description[column]);
}

/**
 * Printed books now carry their own delivery destinations, like mystery boxes:
 * the allowed countries, the fee for each country and an optional free-shipping
 * threshold. Existing books keep the global BOOK_SHIPPING_FEE until the admin
 * configures them, so no order changes price by surprise.
 */
module.exports = {
  async up({ queryInterface, Sequelize }) {
    if (!await columnExists(queryInterface, 'books', 'shippingCountries')) {
      await queryInterface.addColumn('books', 'shippingCountries', {
        type: Sequelize.JSON,
        allowNull: false,
        // Empty for existing books: they keep the global BOOK_SHIPPING_FEE.
        defaultValue: []
      });
    }
    if (!await columnExists(queryInterface, 'books', 'shippingFees')) {
      await queryInterface.addColumn('books', 'shippingFees', {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {}
      });
    }
    if (!await columnExists(queryInterface, 'books', 'shippingFreeOver')) {
      await queryInterface.addColumn('books', 'shippingFreeOver', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      });
    }
  },

  async down({ queryInterface }) {
    for (const column of ['shippingFreeOver', 'shippingFees', 'shippingCountries']) {
      if (await columnExists(queryInterface, 'books', column)) {
        await queryInterface.removeColumn('books', column);
      }
    }
  }
};
