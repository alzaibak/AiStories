/**
 * A book can be sold as a printed copy only (`print_only`), without ever
 * offering its PDF. The other two modes keep working unchanged.
 */
module.exports = {
  async up({ queryInterface }) {
    await queryInterface.sequelize.query(
      "ALTER TABLE books MODIFY COLUMN availabilityMode ENUM('both', 'digital_only', 'print_only') NOT NULL DEFAULT 'both'"
    );
  },

  async down({ queryInterface }) {
    await queryInterface.sequelize.query(
      "UPDATE books SET availabilityMode = 'both' WHERE availabilityMode = 'print_only'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE books MODIFY COLUMN availabilityMode ENUM('both', 'digital_only') NOT NULL DEFAULT 'both'"
    );
  }
};
