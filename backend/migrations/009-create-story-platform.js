const storyModelNames = [
  'Collection',
  'Story',
  'StoryPart',
  'StoryVideo',
  'Quiz',
  'Question',
  'QuizAttempt',
  'ReadingProgress',
  'Book',
  'MediaAsset',
  'StyleGuide',
  'StoreCart',
  'StoreCartItem',
  'StoreOrder',
  'StoreOrderItem',
  'Plan',
  'Subscription',
  'Entitlement',
  'ProcessedWebhookEvent',
  'ReviewerNote'
];

async function up({ queryInterface, Sequelize }) {
  const models = require('../models');
  await queryInterface.changeColumn('users', 'role', {
    type: Sequelize.ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'REVIEWER', 'READER', 'BUYER', 'SELLER'),
    allowNull: false,
    defaultValue: 'READER'
  });
  await queryInterface.changeColumn('users', 'language', {
    type: Sequelize.ENUM('fr', 'en', 'ar'),
    allowNull: false,
    defaultValue: 'ar'
  });
  await queryInterface.changeColumn('email_auth_challenges', 'role', {
    type: Sequelize.ENUM('ADMIN', 'EDITOR', 'REVIEWER', 'READER', 'BUYER', 'SELLER'),
    allowNull: false
  });

  for (const name of storyModelNames) await models[name].sync();
}

async function down({ queryInterface, Sequelize }) {
  for (const table of [
    'reviewer_notes',
    'entitlements',
    'subscriptions',
    'plans',
    'store_order_items',
    'store_orders',
    'store_cart_items',
    'store_carts',
    'style_guides',
    'media_assets',
    'books',
    'reading_progress',
    'quiz_attempts',
    'questions',
    'quizzes',
    'story_videos',
    'story_parts',
    'stories',
    'collections',
    'processed_webhook_events'
  ]) {
    const tables = (await queryInterface.showAllTables()).map((tableName) =>
      (typeof tableName === 'string' ? tableName : String(Object.values(tableName)[0])).toLowerCase()
    );
    if (tables.includes(table)) await queryInterface.dropTable(table);
  }

  await queryInterface.sequelize.query(
    "UPDATE users SET role = 'BUYER' WHERE role IN ('EDITOR', 'REVIEWER', 'READER')"
  );
  await queryInterface.sequelize.query(
    "UPDATE email_auth_challenges SET role = 'BUYER' WHERE role IN ('EDITOR', 'REVIEWER', 'READER')"
  );
  await queryInterface.changeColumn('users', 'role', {
    type: Sequelize.ENUM('SUPER_ADMIN', 'ADMIN', 'BUYER', 'SELLER'),
    allowNull: false,
    defaultValue: 'BUYER'
  });
  await queryInterface.changeColumn('email_auth_challenges', 'role', {
    type: Sequelize.ENUM('ADMIN', 'BUYER', 'SELLER'),
    allowNull: false
  });
}

module.exports = { up, down, storyModelNames };
