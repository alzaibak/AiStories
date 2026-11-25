/** Purchased ebooks are downloadable once; later access stays in the reader's profile. */
module.exports = {
  async up({ queryInterface }) {
    await queryInterface.sequelize.query(
      "UPDATE entitlements SET downloadLimit = 1 WHERE source = 'purchase' AND resourceType IN ('book', 'ebook') AND (downloadLimit IS NULL OR downloadLimit > 1)"
    );
  },

  async down({ queryInterface }) {
    await queryInterface.sequelize.query(
      "UPDATE entitlements SET downloadLimit = 5 WHERE source = 'purchase' AND resourceType IN ('book', 'ebook') AND downloadLimit = 1"
    );
  }
};