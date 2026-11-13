async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function up({ queryInterface, Sequelize }) {
  if (!await tableExists(queryInterface, 'books')) return;

  const columns = await queryInterface.describeTable('books');
  if (!columns.publishedAt) {
    await queryInterface.addColumn('books', 'publishedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
  }

  await queryInterface.sequelize.query(
    'UPDATE books SET publishedAt = updatedAt WHERE isPublished = 1 AND publishedAt IS NULL'
  );
}

async function down() {
  // Keep the repaired column: it may have existed before this migration ran.
}

module.exports = { up, down };
