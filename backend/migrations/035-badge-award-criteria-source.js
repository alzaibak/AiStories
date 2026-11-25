/**
 * The badge engine records automatic awards with sourceType "criteria".
 * The original enum only allowed story/quiz/reading/custom, so every
 * automatic award failed with "Data truncated for column 'sourceType'"
 * and readers never received badge points.
 */
async function up({ queryInterface, Sequelize }) {
  await queryInterface.changeColumn('badge_awards', 'sourceType', {
    type: Sequelize.ENUM('story', 'quiz', 'reading', 'custom', 'criteria'),
    allowNull: false,
    defaultValue: 'custom'
  });
}

async function down({ queryInterface, Sequelize }) {
  await queryInterface.sequelize.query(
    "UPDATE badge_awards SET sourceType = 'custom' WHERE sourceType = 'criteria'"
  );
  await queryInterface.changeColumn('badge_awards', 'sourceType', {
    type: Sequelize.ENUM('story', 'quiz', 'reading', 'custom'),
    allowNull: false,
    defaultValue: 'custom'
  });
}

module.exports = { up, down };
