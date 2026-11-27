async function columnExists(queryInterface, table, column) {
  const description = await queryInterface.describeTable(table);
  return Boolean(description[column]);
}

/**
 * A book can now be sold as a physical copy *and* as an e-book (`both`), or as
 * an e-book only (`digital_only`). Existing rows keep their current offer:
 * e-book books become `digital_only`, printed books stay `both`.
 *
 * Cart lines remember the purchase format the reader picked, so a `both` book
 * can be bought printed or digital without changing the book itself.
 */
module.exports = {
  async up({ queryInterface, Sequelize }) {
    if (!await columnExists(queryInterface, 'books', 'availabilityMode')) {
      await queryInterface.addColumn('books', 'availabilityMode', {
        type: Sequelize.ENUM('both', 'digital_only'),
        allowNull: false,
        defaultValue: 'both'
      });
      await queryInterface.sequelize.query(
        "UPDATE books SET availabilityMode = 'digital_only' WHERE format = 'ebook'"
      );
    }
    if (!await columnExists(queryInterface, 'books', 'digitalPrice')) {
      await queryInterface.addColumn('books', 'digitalPrice', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      });
    }
    if (!await columnExists(queryInterface, 'store_cart_items', 'format')) {
      await queryInterface.addColumn('store_cart_items', 'format', {
        type: Sequelize.ENUM('print', 'ebook'),
        allowNull: true
      });
      await queryInterface.sequelize.query(
        'UPDATE store_cart_items sci JOIN books b ON b.id = sci.bookId SET sci.format = b.format WHERE sci.format IS NULL'
      );
    }
  },

  async down({ queryInterface }) {
    for (const [table, column] of [
      ['store_cart_items', 'format'],
      ['books', 'digitalPrice'],
      ['books', 'availabilityMode']
    ]) {
      if (await columnExists(queryInterface, table, column)) {
        await queryInterface.removeColumn(table, column);
      }
    }
  }
};
