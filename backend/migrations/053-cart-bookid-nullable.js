/** A cart line is either a book or a mystery box: bookId must accept NULL. */
module.exports = {
  async up({ queryInterface }) {
    const [columns] = await queryInterface.sequelize.query('SHOW COLUMNS FROM store_cart_items');
    const bookId = columns.find((column) => column.Field === 'bookId');
    if (bookId && String(bookId.Null).toUpperCase() === 'NO') {
      await queryInterface.sequelize.query('ALTER TABLE store_cart_items MODIFY COLUMN bookId INT NULL');
    }
  },

  async down({ queryInterface }) {
    await queryInterface.sequelize.query('DELETE FROM store_cart_items WHERE bookId IS NULL');
    await queryInterface.sequelize.query('ALTER TABLE store_cart_items MODIFY COLUMN bookId INT NOT NULL');
  }
};
