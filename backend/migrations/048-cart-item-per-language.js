'use strict';

/**
 * A cart used to hold a single line per book, so buying the same e-book in two
 * languages meant switching the existing line. Cart lines are now identified by
 * (book, format, language): the Arabic, English and French PDFs can sit in the
 * cart together.
 */
const LINE_INDEX = 'store_cart_items_line_key';
const LEGACY_INDEX = 'store_cart_items_cart_id_book_id';

async function indexesOf(queryInterface) {
  try {
    return await queryInterface.showIndex('store_cart_items');
  } catch {
    return [];
  }
}

module.exports = {
  async up({ queryInterface }) {
    const indexes = await indexesOf(queryInterface);
    // The foreign key on cartId relied on the unique index: give it its own index
    // before dropping (cartId, bookId).
    if (!indexes.some((index) => index.name === 'store_cart_items_cart_id')) {
      await queryInterface.addIndex('store_cart_items', ['cartId'], { name: 'store_cart_items_cart_id' });
    }
    const legacy = indexes.find((index) => index.name === LEGACY_INDEX);
    if (legacy) await queryInterface.removeIndex('store_cart_items', LEGACY_INDEX);
    if (!indexes.some((index) => index.name === LINE_INDEX)) {
      await queryInterface.addIndex('store_cart_items', ['cartId', 'bookId', 'format', 'language'], {
        unique: true,
        name: LINE_INDEX
      });
    }
  },

  async down({ queryInterface }) {
    const indexes = await indexesOf(queryInterface);
    if (indexes.some((index) => index.name === LINE_INDEX)) {
      await queryInterface.removeIndex('store_cart_items', LINE_INDEX);
    }
    // A rollback cannot keep several languages: only the oldest line per book survives.
    await queryInterface.sequelize.query(`
      DELETE newer FROM store_cart_items newer
      JOIN store_cart_items older
        ON older.cartId = newer.cartId AND older.bookId = newer.bookId AND older.id < newer.id
    `);
    await queryInterface.removeIndex('store_cart_items', 'store_cart_items_cart_id').catch(() => {});
    if (!indexes.some((index) => index.name === LEGACY_INDEX)) {
      await queryInterface.addIndex('store_cart_items', ['cartId', 'bookId'], {
        unique: true,
        name: LEGACY_INDEX
      });
    }
  }
};
