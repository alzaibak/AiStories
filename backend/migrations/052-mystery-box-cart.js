/**
 * A cart line can now hold a mystery box instead of a book. `bookId` becomes
 * nullable so the same cart/table serves both products.
 */
module.exports = {
  async up({ queryInterface, Sequelize }) {
    const table = await queryInterface.describeTable('store_cart_items');
    if (table.bookId && table.bookId.allowNull === false) {
      await queryInterface.changeColumn('store_cart_items', 'bookId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'books', key: 'id' },
        onDelete: 'CASCADE'
      });
    }
    if (!table.mysteryBoxId) {
      await queryInterface.addColumn('store_cart_items', 'mysteryBoxId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'mystery_boxes', key: 'id' },
        onDelete: 'CASCADE'
      });
    }
    await queryInterface.addIndex('store_cart_items', ['mysteryBoxId'], {
      name: 'store_cart_items_mystery_box_id'
    }).catch(() => {});
  },

  async down({ queryInterface, Sequelize }) {
    await queryInterface.removeIndex('store_cart_items', 'store_cart_items_mystery_box_id').catch(() => {});
    const table = await queryInterface.describeTable('store_cart_items');
    if (table.mysteryBoxId) {
      await queryInterface.removeColumn('store_cart_items', 'mysteryBoxId');
    }
    if (table.bookId && table.bookId.allowNull !== false) {
      await queryInterface.changeColumn('store_cart_items', 'bookId', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'books', key: 'id' },
        onDelete: 'CASCADE'
      });
    }
  }
};
