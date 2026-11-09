const fs = require('fs');
const path = require('path');
const sequelize = require('./config/database');
const Sequelize = require('sequelize');

const migrationsDirectory = path.join(__dirname, 'migrations');

function tableNameOf(model) {
  const tableName = model.getTableName();
  return (typeof tableName === 'string' ? tableName : tableName.tableName).toLowerCase();
}

async function syncMissingBaseTables(models, queryInterface) {
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  const existing = new Set(existingTables);

  for (const model of models) {
    const tableName = tableNameOf(model);
    if (existing.has(tableName)) continue;
    await model.sync();
    existing.add(tableName);
  }
}

async function recordMigration(sequelize, queryInterface, migrationTable, file) {
  const columns = await queryInterface.describeTable(migrationTable);
  if (columns.executedAt) {
    await sequelize.query(
      `INSERT INTO ${migrationTable} (name, executedAt) VALUES (?, ?)`,
      { replacements: [file, new Date()] }
    );
    return;
  }

  await sequelize.query(
    `INSERT INTO ${migrationTable} (name) VALUES (?)`,
    { replacements: [file] }
  );
}

async function runMigrations(direction = 'up') {
  const queryInterface = sequelize.getQueryInterface();
  const migrationTable = 'SequelizeMeta';
  const models = require('./models');
  await models.Organization.sync();
  await syncMissingBaseTables([
    models.User,
    models.Category,
    models.Product
  ], queryInterface);

  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  if (!tables.includes(migrationTable.toLowerCase())) {
    await queryInterface.createTable(migrationTable, {
      name: { type: Sequelize.STRING(255), primaryKey: true, allowNull: false },
      executedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
  }

  const applied = await sequelize.query(
    'SELECT name FROM SequelizeMeta ORDER BY name',
    { type: Sequelize.QueryTypes.SELECT }
  );
  const files = fs.readdirSync(migrationsDirectory)
    .filter((file) => /^\d+.*\.js$/.test(file))
    .sort();

  if (direction === 'down') {
    const file = files.filter((item) => applied.some((row) => row.name === item)).pop();
    if (!file) return;
    const migration = require(path.join(migrationsDirectory, file));
    await migration.down({ queryInterface, Sequelize });
    await sequelize.query('DELETE FROM SequelizeMeta WHERE name = ?', { replacements: [file] });
    return;
  }

  for (const file of files) {
    if (applied.some((row) => row.name === file)) continue;
    const migration = require(path.join(migrationsDirectory, file));
    await migration.up({ queryInterface, Sequelize });
    await recordMigration(sequelize, queryInterface, migrationTable, file);
    console.info(`Migration appliquée : ${file}`);
  }
}

if (require.main === module) {
  const direction = process.argv[2] || 'up';
  if (!['up', 'down'].includes(direction)) {
    console.error('Usage: node migrate.js [up|down]');
    process.exitCode = 1;
  } else {
    runMigrations(direction)
      .then(() => sequelize.close())
      .catch(async (error) => {
        console.error('Échec de la migration :', error);
        await sequelize.close();
        process.exitCode = 1;
      });
  }
}

module.exports = runMigrations;
module.exports.syncMissingBaseTables = syncMissingBaseTables;
module.exports.recordMigration = recordMigration;
