'use strict';

/**
 * Orders placed before the availability mode only stored the format on the book.
 * Copy it to the order line so old purchases keep their download access when an
 * admin later turns an e-book into a "printed + e-book" book.
 */
module.exports = {
  async up({ queryInterface }) {
    await queryInterface.sequelize.query(`
      UPDATE store_order_items oi
      JOIN books b ON b.id = oi.bookId
      SET oi.formatSnapshot = b.format
      WHERE (oi.formatSnapshot IS NULL OR oi.formatSnapshot = '')
        AND b.format IN ('print', 'ebook')
    `);
  },

  async down() {
    // Data backfill only: nothing to roll back without risking valid snapshots.
  }
};
