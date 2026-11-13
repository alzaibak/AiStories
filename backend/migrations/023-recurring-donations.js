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
  if (!await tableExists(queryInterface, 'recurring_donations')) {
    await queryInterface.createTable('recurring_donations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      campaignId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'donation_campaigns', key: 'id' }, onDelete: 'RESTRICT'
      },
      userId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE'
      },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'active', 'past_due', 'canceled', 'expired'),
        allowNull: false,
        defaultValue: 'pending'
      },
      cancelAtPeriodEnd: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      stripeCheckoutSessionId: { type: Sequelize.STRING(255), allowNull: true, unique: true },
      stripeSubscriptionId: { type: Sequelize.STRING(255), allowNull: true, unique: true },
      stripeCustomerId: { type: Sequelize.STRING(255), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
  }
  await addColumnIfMissing(queryInterface, 'recurring_donations', 'cancelAtPeriodEnd', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
  await addColumnIfMissing(queryInterface, 'donations', 'recurringDonationId', {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: { model: 'recurring_donations', key: 'id' },
    onDelete: 'SET NULL'
  });
  await addColumnIfMissing(queryInterface, 'donations', 'stripeInvoiceId', {
    type: Sequelize.STRING(255),
    allowNull: true,
    unique: true
  });
}

async function down({ queryInterface }) {
  if (await tableExists(queryInterface, 'donations')) {
    const columns = await queryInterface.describeTable('donations');
    for (const column of ['stripeInvoiceId', 'recurringDonationId']) {
      if (columns[column]) await queryInterface.removeColumn('donations', column);
    }
  }
  if (await tableExists(queryInterface, 'recurring_donations')) {
    await queryInterface.dropTable('recurring_donations');
  }
}

module.exports = { up, down };
