const { INTEGER } = require('sequelize');

module.exports = {
  async up({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('recurring_donations')) return;
    const constraints = await queryInterface.showConstraint('recurring_donations');
    const foreignKey = constraints.find((constraint) =>
      constraint.constraintType === 'FOREIGN KEY' &&
      (constraint.columnNames || []).includes('campaignId')
    );
    if (foreignKey) await queryInterface.removeConstraint('recurring_donations', foreignKey.constraintName);
    await queryInterface.changeColumn('recurring_donations', 'campaignId', {
      type: INTEGER,
      allowNull: true
    });
    await queryInterface.addConstraint('recurring_donations', {
      fields: ['campaignId'],
      type: 'foreign key',
      name: 'recurring_donations_campaign_fk',
      references: { table: 'donation_campaigns', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },

  async down({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('recurring_donations')) return;
    const constraints = await queryInterface.showConstraint('recurring_donations');
    const foreignKey = constraints.find((constraint) =>
      constraint.constraintType === 'FOREIGN KEY' &&
      (constraint.columnNames || []).includes('campaignId')
    );
    if (foreignKey) await queryInterface.removeConstraint('recurring_donations', foreignKey.constraintName);
    await queryInterface.changeColumn('recurring_donations', 'campaignId', {
      type: INTEGER,
      allowNull: false
    });
    await queryInterface.addConstraint('recurring_donations', {
      fields: ['campaignId'],
      type: 'foreign key',
      name: 'recurring_donations_campaign_fk',
      references: { table: 'donation_campaigns', field: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  }
};