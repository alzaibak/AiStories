async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function addColumnIfMissing(queryInterface, table, column, definition) {
  if (!await tableExists(queryInterface, table)) return;
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) await queryInterface.addColumn(table, column, definition);
}

async function up({ queryInterface, Sequelize }) {
  await addColumnIfMissing(queryInterface, 'stories', 'reviewChecklist', {
    type: Sequelize.JSON,
    allowNull: false,
    defaultValue: {}
  });
  const videoFields = {
    mediaAssetId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'media_assets', key: 'id' },
      onDelete: 'SET NULL'
    },
    title: { type: Sequelize.STRING(255), allowNull: false, defaultValue: '' },
    description: { type: Sequelize.TEXT, allowNull: false, defaultValue: '' },
    translations: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
    subtitles: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
    authorId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL'
    },
    reviewedBy: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL'
    },
    reviewedAt: { type: Sequelize.DATE, allowNull: true },
    rejectionReason: { type: Sequelize.TEXT, allowNull: true },
    status: {
      type: Sequelize.ENUM('draft', 'in_review', 'published', 'rejected', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    }
  };
  for (const [column, definition] of Object.entries(videoFields)) {
    await addColumnIfMissing(queryInterface, 'story_videos', column, definition);
  }
  if (await tableExists(queryInterface, 'story_videos')) {
    await queryInterface.sequelize.query(
      "UPDATE story_videos SET status = 'published' WHERE productionStatus = 'published' AND videoUrl IS NOT NULL AND videoUrl <> ''"
    );
  }
}

async function down({ queryInterface }) {
  for (const [table, column] of [
    ['story_videos', 'status'],
    ['story_videos', 'subtitles'],
    ['story_videos', 'translations'],
    ['story_videos', 'description'],
    ['story_videos', 'title'],
    ['story_videos', 'rejectionReason'],
    ['story_videos', 'reviewedAt'],
    ['story_videos', 'reviewedBy'],
    ['story_videos', 'authorId'],
    ['story_videos', 'mediaAssetId'],
    ['stories', 'reviewChecklist']
  ]) {
    const tables = (await queryInterface.showAllTables()).map((item) =>
      (typeof item === 'string' ? item : String(Object.values(item)[0])).toLowerCase()
    );
    if (!tables.includes(table)) continue;
    const columns = await queryInterface.describeTable(table);
    if (columns[column]) await queryInterface.removeColumn(table, column);
  }
}

module.exports = { up, down };
