async function columnExists(queryInterface, table, column) {
  const description = await queryInterface.describeTable(table);
  return Boolean(description[column]);
}

/**
 * Ebooks can ship one PDF per language (Arabic, English, French), and the reader
 * buys a specific language: the cart, the order line and the entitlement keep
 * that choice, so only the purchased version can be downloaded.
 */
module.exports = {
  async up({ queryInterface, Sequelize }) {
    if (!await columnExists(queryInterface, 'books', 'bookFiles')) {
      await queryInterface.addColumn('books', 'bookFiles', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
    if (!await columnExists(queryInterface, 'store_cart_items', 'language')) {
      await queryInterface.addColumn('store_cart_items', 'language', {
        type: Sequelize.STRING(5),
        allowNull: true
      });
    }
    if (!await columnExists(queryInterface, 'store_order_items', 'language')) {
      await queryInterface.addColumn('store_order_items', 'language', {
        type: Sequelize.STRING(5),
        allowNull: true
      });
    }
    if (!await columnExists(queryInterface, 'entitlements', 'contentLanguage')) {
      await queryInterface.addColumn('entitlements', 'contentLanguage', {
        type: Sequelize.STRING(5),
        allowNull: true
      });
    }
  },

  async down({ queryInterface }) {
    for (const [table, column] of [
      ['books', 'bookFiles'],
      ['store_cart_items', 'language'],
      ['store_order_items', 'language'],
      ['entitlements', 'contentLanguage']
    ]) {
      if (await columnExists(queryInterface, table, column)) {
        await queryInterface.removeColumn(table, column);
      }
    }
  }
};
