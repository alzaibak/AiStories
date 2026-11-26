async function columnExists(queryInterface, table, column) {
  const description = await queryInterface.describeTable(table);
  return Boolean(description[column]);
}

/**
 * Reading order needs a per-part lifecycle: a part can either be a real,
 * published part or an upcoming ("coming soon") placeholder that carries only a
 * title, an expected date and a teaser. Keeping the flag on the part itself
 * means the placeholder keeps its id and position when it is published.
 */
module.exports = {
  async up({ queryInterface, Sequelize }) {
    if (!await columnExists(queryInterface, 'story_parts', 'status')) {
      await queryInterface.addColumn('story_parts', 'status', {
        type: Sequelize.ENUM('published', 'coming_soon'),
        allowNull: false,
        defaultValue: 'published'
      });
    }
    if (!await columnExists(queryInterface, 'story_parts', 'expectedAt')) {
      await queryInterface.addColumn('story_parts', 'expectedAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
    if (!await columnExists(queryInterface, 'story_parts', 'teaser')) {
      await queryInterface.addColumn('story_parts', 'teaser', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
  },

  async down({ queryInterface }) {
    for (const column of ['teaser', 'expectedAt', 'status']) {
      if (await columnExists(queryInterface, 'story_parts', column)) {
        await queryInterface.removeColumn('story_parts', column);
      }
    }
  }
};
