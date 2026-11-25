async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function addColumnIfMissing(queryInterface, table, column, definition) {
  if (!await tableExists(queryInterface, table)) return false;
  const columns = await queryInterface.describeTable(table);
  if (columns[column]) return false;
  await queryInterface.addColumn(table, column, definition);
  return true;
}

/**
 * Story imagery: a portrait cover (3:4 cards), an optional wide hero, a social
 * image, localized alt text, a focal point for smart cropping and a credit.
 * Collections get a cover + banner, parts an optional reader illustration.
 */
async function up({ queryInterface, Sequelize }) {
  const string = { type: Sequelize.STRING(1000), allowNull: true };
  const json = { type: Sequelize.JSON, allowNull: true };

  for (const column of ['coverImage', 'heroImage', 'socialImage']) {
    await addColumnIfMissing(queryInterface, 'stories', column, string);
  }
  await addColumnIfMissing(queryInterface, 'stories', 'coverAlt', json);
  await addColumnIfMissing(queryInterface, 'stories', 'coverVariants', json);
  await addColumnIfMissing(queryInterface, 'stories', 'focalPoint', json);
  await addColumnIfMissing(queryInterface, 'stories', 'imageCredit', {
    type: Sequelize.STRING(300), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'stories', 'hook', {
    type: Sequelize.STRING(500), allowNull: true
  });

  for (const column of ['coverImage', 'bannerImage']) {
    await addColumnIfMissing(queryInterface, 'collections', column, string);
  }
  await addColumnIfMissing(queryInterface, 'collections', 'coverAlt', json);
  await addColumnIfMissing(queryInterface, 'collections', 'focalPoint', json);

  await addColumnIfMissing(queryInterface, 'story_parts', 'illustrationImage', string);
}

async function down({ queryInterface }) {
  for (const [table, columns] of Object.entries({
    stories: ['coverImage', 'heroImage', 'socialImage', 'coverAlt', 'coverVariants', 'focalPoint', 'imageCredit', 'hook'],
    collections: ['coverImage', 'bannerImage', 'coverAlt', 'focalPoint'],
    story_parts: ['illustrationImage']
  })) {
    if (!await tableExists(queryInterface, table)) continue;
    const existing = await queryInterface.describeTable(table);
    for (const column of columns) {
      if (existing[column]) await queryInterface.removeColumn(table, column);
    }
  }
}

module.exports = { up, down };
