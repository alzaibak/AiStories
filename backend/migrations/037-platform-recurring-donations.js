const { INTEGER, QueryTypes } = require('sequelize');

async function campaignForeignKeys(queryInterface) {
  const rows = await queryInterface.sequelize.query(
    `SELECT k.CONSTRAINT_NAME AS name, r.DELETE_RULE AS deleteRule, c.IS_NULLABLE AS nullable
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
        AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        AND r.TABLE_NAME = k.TABLE_NAME
       JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
        AND c.TABLE_NAME = k.TABLE_NAME
        AND c.COLUMN_NAME = k.COLUMN_NAME
      WHERE k.TABLE_SCHEMA = DATABASE()
        AND k.TABLE_NAME = 'recurring_donations'
        AND k.COLUMN_NAME = 'campaignId'
        AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );
  return rows;
}

async function ensureCampaignForeignKey(queryInterface, { nullable, deleteRule }) {
  const desiredName = 'recurring_donations_campaign_fk';
  const existing = await campaignForeignKeys(queryInterface);
  const desired = existing.find((foreignKey) => foreignKey.name === desiredName);
  for (const foreignKey of existing) {
    if (foreignKey.name !== desiredName) await queryInterface.removeConstraint('recurring_donations', foreignKey.name);
  }
  if (desired && desired.nullable === (nullable ? 'YES' : 'NO') && desired.deleteRule === deleteRule) return;
  if (desired) await queryInterface.removeConstraint('recurring_donations', desiredName);
  await queryInterface.changeColumn('recurring_donations', 'campaignId', {
    type: INTEGER,
    allowNull: nullable
  });
  const afterChange = await campaignForeignKeys(queryInterface);
  for (const foreignKey of afterChange) {
    await queryInterface.removeConstraint('recurring_donations', foreignKey.name);
  }
  await queryInterface.addConstraint('recurring_donations', {
    fields: ['campaignId'],
    type: 'foreign key',
    name: desiredName,
    references: { table: 'donation_campaigns', field: 'id' },
    onDelete: deleteRule,
    onUpdate: 'CASCADE'
  });
}

module.exports = {
  async up({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('recurring_donations')) return;
    await ensureCampaignForeignKey(queryInterface, { nullable: true, deleteRule: 'SET NULL' });
  },

  async down({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('recurring_donations')) return;
    await ensureCampaignForeignKey(queryInterface, { nullable: false, deleteRule: 'RESTRICT' });
  }
};