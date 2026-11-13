async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function addIndexIfMissing(queryInterface, table, fields, name, unique = false) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(table, fields, { name, unique });
  }
}

async function up({ queryInterface, Sequelize }) {
  if (!await tableExists(queryInterface, 'badge_types')) {
    await queryInterface.createTable('badge_types', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      translations: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
      icon: { type: Sequelize.STRING(255), allowNull: true },
      criteria: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  }

  if (!await tableExists(queryInterface, 'badge_awards')) {
    await queryInterface.createTable('badge_awards', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      badgeTypeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'badge_types', key: 'id' },
        onDelete: 'CASCADE'
      },
      sourceType: {
        type: Sequelize.ENUM('story', 'quiz', 'reading', 'custom'),
        allowNull: false,
        defaultValue: 'custom'
      },
      sourceId: { type: Sequelize.INTEGER, allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
      awardedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await addIndexIfMissing(queryInterface, 'badge_awards', ['userId', 'badgeTypeId', 'sourceType', 'sourceId'], 'badge_awards_user_badge_source_unique', true);
  }

  if (!await tableExists(queryInterface, 'certificates')) {
    await queryInterface.createTable('certificates', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      badgeTypeId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'badge_types', key: 'id' },
        onDelete: 'SET NULL'
      },
      storyId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'stories', key: 'id' },
        onDelete: 'SET NULL'
      },
      quizId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'quizzes', key: 'id' },
        onDelete: 'SET NULL'
      },
      title: { type: Sequelize.STRING(255), allowNull: false },
      verificationCode: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      issuedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      pdfPath: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  }

  if (!await tableExists(queryInterface, 'story_reviews')) {
    await queryInterface.createTable('story_reviews', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      storyId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'stories', key: 'id' },
        onDelete: 'CASCADE'
      },
      bookId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'books', key: 'id' },
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      rating: { type: Sequelize.INTEGER, allowNull: false },
      title: { type: Sequelize.STRING(255), allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'hidden', 'reported'),
        allowNull: false,
        defaultValue: 'pending'
      },
      moderationNote: { type: Sequelize.TEXT, allowNull: true },
      isVerifiedBuyer: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  }

  if (!await tableExists(queryInterface, 'story_requests')) {
    await queryInterface.createTable('story_requests', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      title: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      source: { type: Sequelize.TEXT, allowNull: true },
      contactEmail: { type: Sequelize.STRING(255), allowNull: true },
      status: {
        type: Sequelize.ENUM('new', 'accepted', 'rejected', 'converted'),
        allowNull: false,
        defaultValue: 'new'
      },
      adminNotes: { type: Sequelize.TEXT, allowNull: true },
      convertedStoryId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'stories', key: 'id' },
        onDelete: 'SET NULL'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  }
}

async function down({ queryInterface }) {
  for (const table of ['story_requests', 'story_reviews', 'certificates', 'badge_awards', 'badge_types']) {
    if (await tableExists(queryInterface, table)) {
      await queryInterface.dropTable(table);
    }
  }
}

module.exports = { up, down };
