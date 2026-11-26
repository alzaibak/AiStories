async function columnExists(queryInterface, table, column) {
  const description = await queryInterface.describeTable(table);
  return Boolean(description[column]);
}

/**
 * Promotional blocks (texts and images) written by the admin to sell a box on
 * its public page: [{ type, title, body, imageUrl, imageAlt }] with per
 * language text. An empty array means "no promo section".
 */
module.exports = {
  async up({ queryInterface, Sequelize }) {
    if (await columnExists(queryInterface, 'mystery_boxes', 'promoBlocks')) return;
    await queryInterface.addColumn('mystery_boxes', 'promoBlocks', {
      type: Sequelize.JSON,
      allowNull: false,
      defaultValue: []
    });
    // Existing rows were created before the column, and MySQL stores them as a
    // JSON null rather than an empty array: they start with no promo section.
    await queryInterface.sequelize.query(
      "UPDATE mystery_boxes SET promoBlocks = '[]' WHERE promoBlocks IS NULL OR JSON_TYPE(promoBlocks) = 'NULL'"
    );
  },

  async down({ queryInterface }) {
    if (!await columnExists(queryInterface, 'mystery_boxes', 'promoBlocks')) return;
    await queryInterface.removeColumn('mystery_boxes', 'promoBlocks');
  }
};
