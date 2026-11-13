const { slugify, slugFromLocalized } = require('../utils/slug');

const tableExists = async (queryInterface, name) => {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
};

async function addColumnIfMissing(queryInterface, Sequelize, table, column, definition) {
  if (!(await tableExists(queryInterface, table))) return;
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) await queryInterface.addColumn(table, column, definition);
}

function parseTranslations(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

async function repairSlugs(queryInterface, Sequelize, table, type, used) {
  if (!(await tableExists(queryInterface, table))) return [];
  const rows = await queryInterface.sequelize.query(
    `SELECT id, slug, title, translations FROM ${table} ORDER BY id`,
    { type: Sequelize.QueryTypes.SELECT }
  );
  const redirects = [];
  for (const row of rows) {
    const oldSlug = String(row.slug || '');
    let nextSlug = oldSlug.length >= 2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(oldSlug)
      ? oldSlug
      : slugFromLocalized(row.title, parseTranslations(row.translations));
    if (!nextSlug || nextSlug.length < 2) nextSlug = `${type}-${row.id}`;
    const base = nextSlug.slice(0, 240);
    let suffix = 1;
    while (used.has(nextSlug)) {
      const ending = `-${suffix++}`;
      nextSlug = `${base.slice(0, 255 - ending.length)}${ending}`;
    }
    used.add(nextSlug);
    if (nextSlug !== oldSlug) {
      await queryInterface.bulkUpdate(table, { slug: nextSlug }, { id: row.id });
      if (oldSlug) redirects.push({ entityType: type, oldSlug, newSlug: nextSlug });
    }
  }
  return redirects;
}

async function up({ queryInterface, Sequelize }) {
  await addColumnIfMissing(queryInterface, Sequelize, 'users', 'mustChangePassword', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
  await addColumnIfMissing(queryInterface, Sequelize, 'users', 'tokenVersion', {
    type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
  });
  await addColumnIfMissing(queryInterface, Sequelize, 'users', 'adminLoginFailedAttempts', {
    type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
  });
  await addColumnIfMissing(queryInterface, Sequelize, 'users', 'adminLockedUntil', {
    type: Sequelize.DATE, allowNull: true
  });
  for (const [column, definition] of Object.entries({
    authorId: {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'users', key: 'id' }, onDelete: 'SET NULL'
    },
    publishedAt: { type: Sequelize.DATE, allowNull: true },
    reviewedBy: {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'users', key: 'id' }, onDelete: 'SET NULL'
    },
    reviewedAt: { type: Sequelize.DATE, allowNull: true },
    rejectionReason: { type: Sequelize.TEXT, allowNull: true }
  })) await addColumnIfMissing(queryInterface, Sequelize, 'stories', column, definition);

  if (await tableExists(queryInterface, 'stories')) {
    await queryInterface.changeColumn('stories', 'status', {
      type: Sequelize.ENUM('draft', 'in_review', 'published', 'rejected', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    });
    await queryInterface.sequelize.query(
      "UPDATE stories SET publishedAt = COALESCE(publishedAt, publishAt, updatedAt) WHERE status = 'published'"
    );
    await queryInterface.sequelize.query(
      "UPDATE stories SET reviewedBy = reviewerId, reviewedAt = COALESCE(reviewedAt, approvedAt) WHERE approvedAt IS NOT NULL AND reviewedBy IS NULL"
    );
  }

  if (await tableExists(queryInterface, 'books')) {
    await addColumnIfMissing(queryInterface, Sequelize, 'books', 'status', {
      type: Sequelize.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    });
    await addColumnIfMissing(queryInterface, Sequelize, 'books', 'publishedAt', {
      type: Sequelize.DATE, allowNull: true
    });
    await queryInterface.sequelize.query(
      "UPDATE books SET status = CASE WHEN isPublished = 1 THEN 'published' ELSE 'draft' END"
    );
    await queryInterface.sequelize.query(
      'UPDATE books SET publishedAt = updatedAt WHERE status = \'published\' AND publishedAt IS NULL'
    );
  }

  if (!(await tableExists(queryInterface, 'slug_redirects'))) {
    await queryInterface.createTable('slug_redirects', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      entityType: { type: Sequelize.ENUM('collection', 'story', 'book'), allowNull: false },
      oldSlug: { type: Sequelize.STRING(255), allowNull: false },
      newSlug: { type: Sequelize.STRING(255), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('slug_redirects', ['entityType', 'oldSlug'], { unique: true });
  }
  if (!(await tableExists(queryInterface, 'admin_password_resets'))) {
    await queryInterface.createTable('admin_password_resets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE'
      },
      tokenHash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      usedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('admin_password_resets', ['userId', 'expiresAt']);
  }

  const redirects = [];
  const usedSlugs = new Set();
  redirects.push(...await repairSlugs(queryInterface, Sequelize, 'collections', 'collection', usedSlugs));
  redirects.push(...await repairSlugs(queryInterface, Sequelize, 'stories', 'story', usedSlugs));
  redirects.push(...await repairSlugs(queryInterface, Sequelize, 'books', 'book', usedSlugs));
  for (const redirect of redirects) {
    await queryInterface.bulkInsert('slug_redirects', [{
      ...redirect,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);
  }
}

async function down({ queryInterface, Sequelize }) {
  for (const table of ['admin_password_resets', 'slug_redirects']) {
    if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
  }
  if (await tableExists(queryInterface, 'books')) {
    const bookColumns = await queryInterface.describeTable('books');
    if (bookColumns.status) {
      await queryInterface.sequelize.query(
        "UPDATE books SET isPublished = 1 WHERE status = 'published'"
      );
    }
  }
  for (const [table, columns] of Object.entries({
    users: ['mustChangePassword', 'tokenVersion', 'adminLoginFailedAttempts', 'adminLockedUntil'],
    stories: ['authorId', 'publishedAt', 'reviewedBy', 'reviewedAt', 'rejectionReason'],
    books: ['status', 'publishedAt']
  })) {
    if (!(await tableExists(queryInterface, table))) continue;
    const existing = await queryInterface.describeTable(table);
    for (const column of columns) {
      if (existing[column]) await queryInterface.removeColumn(table, column);
    }
  }
  if (await tableExists(queryInterface, 'stories')) {
    await queryInterface.changeColumn('stories', 'status', {
      type: Sequelize.ENUM('draft', 'in_review', 'published'),
      allowNull: false,
      defaultValue: 'draft'
    });
  }
}

module.exports = { up, down, slugify, repairSlugs };
