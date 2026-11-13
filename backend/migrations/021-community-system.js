async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function createIfMissing(queryInterface, table, definition) {
  if (!await tableExists(queryInterface, table)) await queryInterface.createTable(table, definition);
}

async function up({ queryInterface, Sequelize }) {
  const id = { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true };
  const timestamps = {
    createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
  };
  const userRef = (onDelete = 'CASCADE') => ({
    type: Sequelize.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete
  });
  if (await tableExists(queryInterface, 'users')) {
    const userColumns = await queryInterface.describeTable('users');
    if (!userColumns.emailPreferences) {
      await queryInterface.addColumn('users', 'emailPreferences', {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: { marketing: true, reminders: true }
      });
    }
  }

  await createIfMissing(queryInterface, 'community_events', {
    id,
    slug: { type: Sequelize.STRING(160), allowNull: false, unique: true },
    translations: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
    startsAt: { type: Sequelize.DATE, allowNull: false },
    endsAt: { type: Sequelize.DATE, allowNull: false },
    status: { type: Sequelize.ENUM('draft', 'published', 'completed', 'cancelled'), allowNull: false, defaultValue: 'draft' },
    quizId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'quizzes', key: 'id' }, onDelete: 'SET NULL' },
    ...timestamps
  });
  await createIfMissing(queryInterface, 'event_entries', {
    id,
    eventId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'community_events', key: 'id' }, onDelete: 'CASCADE' },
    userId: userRef(),
    score: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    metadata: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
    ...timestamps
  });
  await createIfMissing(queryInterface, 'teams', {
    id,
    ownerId: userRef(),
    name: { type: Sequelize.STRING(120), allowNull: false },
    inviteCode: { type: Sequelize.STRING(32), allowNull: false, unique: true },
    isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    ...timestamps
  });
  await createIfMissing(queryInterface, 'team_members', {
    id,
    teamId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'teams', key: 'id' }, onDelete: 'CASCADE' },
    userId: userRef(),
    displayName: { type: Sequelize.STRING(80), allowNull: false },
    role: { type: Sequelize.ENUM('owner', 'member'), allowNull: false, defaultValue: 'member' },
    ...timestamps
  });
  await createIfMissing(queryInterface, 'donation_campaigns', {
    id,
    slug: { type: Sequelize.STRING(160), allowNull: false, unique: true },
    translations: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
    goalAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
    currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'EUR' },
    status: { type: Sequelize.ENUM('draft', 'active', 'completed', 'archived'), allowNull: false, defaultValue: 'draft' },
    startsAt: { type: Sequelize.DATE, allowNull: true },
    endsAt: { type: Sequelize.DATE, allowNull: true },
    ...timestamps
  });
  await createIfMissing(queryInterface, 'donations', {
    id,
    campaignId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'donation_campaigns', key: 'id' }, onDelete: 'RESTRICT' },
    userId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
    currency: { type: Sequelize.STRING(3), allowNull: false },
    status: { type: Sequelize.ENUM('pending', 'paid', 'failed', 'refunded'), allowNull: false, defaultValue: 'pending' },
    stripeCheckoutSessionId: { type: Sequelize.STRING(255), allowNull: true, unique: true },
    stripePaymentIntentId: { type: Sequelize.STRING(255), allowNull: true },
    ...timestamps
  });
  await createIfMissing(queryInterface, 'email_templates', {
    id,
    code: { type: Sequelize.STRING(100), allowNull: false, unique: true },
    translations: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
    isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    ...timestamps
  });
  await createIfMissing(queryInterface, 'scheduled_reminders', {
    id,
    userId: userRef(),
    code: { type: Sequelize.STRING(100), allowNull: false },
    scheduledAt: { type: Sequelize.DATE, allowNull: false },
    sentAt: { type: Sequelize.DATE, allowNull: true },
    status: { type: Sequelize.ENUM('pending', 'sent', 'cancelled'), allowNull: false, defaultValue: 'pending' },
    metadata: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
    ...timestamps
  });
  await createIfMissing(queryInterface, 'policy_pages', {
    id,
    code: { type: Sequelize.STRING(80), allowNull: false, unique: true },
    translations: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
    updatedBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    ...timestamps
  });

  for (const [table, fields, name, unique] of [
    ['event_entries', ['eventId', 'userId'], 'event_entries_event_user_unique', true],
    ['team_members', ['teamId', 'userId'], 'team_members_team_user_unique', true],
    ['team_members', ['userId'], 'team_members_user_unique', true],
    ['scheduled_reminders', ['status', 'scheduledAt'], 'scheduled_reminders_status_scheduled_at', false]
  ]) {
    const indexes = await queryInterface.showIndex(table);
    if (!indexes.some((index) => index.name === name)) {
      await queryInterface.addIndex(table, fields, { name, unique });
    }
  }
}

async function down({ queryInterface }) {
  for (const table of [
    'policy_pages', 'scheduled_reminders', 'email_templates', 'donations',
    'donation_campaigns', 'team_members', 'teams', 'event_entries', 'community_events'
  ]) {
    if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
  }
  if (await tableExists(queryInterface, 'users')) {
    const columns = await queryInterface.describeTable('users');
    if (columns.emailPreferences) await queryInterface.removeColumn('users', 'emailPreferences');
  }
}

module.exports = { up, down };
