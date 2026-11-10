const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const id = {
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true
};
const timestamps = { timestamps: true };

const Collection = sequelize.define('Collection', {
  id,
  title: { type: DataTypes.STRING(255), allowNull: false },
  slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  cover: { type: DataTypes.STRING(1000), allowNull: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  isFree: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { ...timestamps, tableName: 'collections' });

const Story = sequelize.define('Story', {
  id,
  collectionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'collections', key: 'id' },
    onDelete: 'RESTRICT'
  },
  title: { type: DataTypes.STRING(255), allowNull: false },
  slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  summary: { type: DataTypes.TEXT, allowNull: false },
  cover: { type: DataTypes.STRING(1000), allowNull: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  type: {
    type: DataTypes.ENUM('quran', 'sunnah', 'history', 'new'),
    allowNull: false
  },
  sourceBadge: {
    type: DataTypes.ENUM('quran_verse', 'authentic_hadith', 'historical_source', 'inspired_story'),
    allowNull: false
  },
  sourceReferences: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  status: {
    type: DataTypes.ENUM('draft', 'in_review', 'published'),
    allowNull: false,
    defaultValue: 'draft'
  },
  reviewerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  reviewerName: { type: DataTypes.STRING(255), allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  isFree: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  publishAt: { type: DataTypes.DATE, allowNull: true },
  tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  ageGroup: { type: DataTypes.ENUM('kids', 'teens', 'adults', 'all'), allowNull: false, defaultValue: 'all' },
  isStoryOfTheWeek: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  ...timestamps,
  tableName: 'stories',
  indexes: [
    { fields: ['collectionId', 'status'] },
    { fields: ['status', 'publishAt'] },
    { fields: ['isStoryOfTheWeek'] }
  ]
});

const StoryPart = sequelize.define('StoryPart', {
  id,
  storyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'stories', key: 'id' },
    onDelete: 'CASCADE'
  },
  partNumber: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  content: { type: DataTypes.TEXT('long'), allowNull: false },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  estimatedReadingMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  endingHook: { type: DataTypes.TEXT, allowNull: false },
  isFree: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  releaseAt: { type: DataTypes.DATE, allowNull: true },
  earlyAccessUntil: { type: DataTypes.DATE, allowNull: true }
}, {
  ...timestamps,
  tableName: 'story_parts',
  indexes: [{ unique: true, fields: ['storyId', 'partNumber'] }]
});

const StoryVideo = sequelize.define('StoryVideo', {
  id,
  storyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'stories', key: 'id' },
    onDelete: 'CASCADE'
  },
  partId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'story_parts', key: 'id' },
    onDelete: 'SET NULL'
  },
  videoUrl: { type: DataTypes.STRING(1000), allowNull: true },
  durationSeconds: { type: DataTypes.INTEGER, allowNull: true },
  thumbnail: { type: DataTypes.STRING(1000), allowNull: true },
  episodeNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  isFree: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  productionStatus: {
    type: DataTypes.ENUM('script_reviewed', 'storyboard', 'images', 'voice_over', 'music', 'montage', 'published'),
    allowNull: false,
    defaultValue: 'script_reviewed'
  },
  productionCost: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  depictionPolicyConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  ...timestamps,
  tableName: 'story_videos',
  indexes: [{ unique: true, fields: ['storyId', 'episodeNumber'] }]
});

const Quiz = sequelize.define('Quiz', {
  id,
  storyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'stories', key: 'id' },
    onDelete: 'CASCADE'
  },
  partId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'story_parts', key: 'id' },
    onDelete: 'SET NULL'
  },
  title: { type: DataTypes.STRING(255), allowNull: false },
  difficulty: { type: DataTypes.ENUM('kids', 'teens', 'adults'), allowNull: false },
  passingScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
  timeLimitSeconds: { type: DataTypes.INTEGER, allowNull: true },
  validationStatus: { type: DataTypes.ENUM('draft', 'validated'), allowNull: false, defaultValue: 'draft' }
}, { ...timestamps, tableName: 'quizzes' });

const Question = sequelize.define('Question', {
  id,
  quizId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'quizzes', key: 'id' },
    onDelete: 'CASCADE'
  },
  text: { type: DataTypes.TEXT, allowNull: false },
  options: { type: DataTypes.JSON, allowNull: false },
  correctAnswer: { type: DataTypes.STRING(500), allowNull: false },
  explanation: { type: DataTypes.TEXT, allowNull: false },
  source: { type: DataTypes.STRING(500), allowNull: false },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { ...timestamps, tableName: 'questions', indexes: [{ fields: ['quizId', 'sortOrder'] }] });

const QuizAttempt = sequelize.define('QuizAttempt', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  quizId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'quizzes', key: 'id' }, onDelete: 'CASCADE' },
  score: { type: DataTypes.INTEGER, allowNull: true },
  answers: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  completedAt: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'quiz_attempts', indexes: [{ fields: ['userId', 'quizId'] }] });

const ReadingProgress = sequelize.define('ReadingProgress', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  storyId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE' },
  lastPartId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'story_parts', key: 'id' }, onDelete: 'SET NULL' },
  completedParts: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  lastReadAt: { type: DataTypes.DATE, allowNull: true }
}, {
  ...timestamps,
  tableName: 'reading_progress',
  indexes: [{ unique: true, fields: ['userId', 'storyId'] }]
});

const Book = sequelize.define('Book', {
  id,
  collectionId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'collections', key: 'id' }, onDelete: 'SET NULL' },
  storyId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'stories', key: 'id' }, onDelete: 'SET NULL' },
  title: { type: DataTypes.STRING(255), allowNull: false },
  slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  cover: { type: DataTypes.STRING(1000), allowNull: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  format: { type: DataTypes.ENUM('print', 'ebook'), allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  stockQuantity: { type: DataTypes.INTEGER, allowNull: true },
  fileStorageKey: { type: DataTypes.STRING(1024), allowNull: true },
  stripeProductId: { type: DataTypes.STRING(255), allowNull: true },
  stripePriceId: { type: DataTypes.STRING(255), allowNull: true },
  isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, { ...timestamps, tableName: 'books' });

const MediaAsset = sequelize.define('MediaAsset', {
  id,
  storyId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE' },
  partId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'story_parts', key: 'id' }, onDelete: 'CASCADE' },
  bookId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'books', key: 'id' }, onDelete: 'CASCADE' },
  uploadedBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' },
  mediaType: { type: DataTypes.ENUM('image', 'video', 'ebook', 'cover', 'thumbnail'), allowNull: false },
  fileName: { type: DataTypes.STRING(255), allowNull: false },
  storageKey: { type: DataTypes.STRING(1024), allowNull: true },
  externalUrl: { type: DataTypes.STRING(1000), allowNull: true },
  mimeType: { type: DataTypes.STRING(150), allowNull: true },
  depictionPolicyConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }
}, { ...timestamps, tableName: 'media_assets' });

const StyleGuide = sequelize.define('StyleGuide', {
  id,
  title: { type: DataTypes.STRING(255), allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: false },
  referenceImages: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { ...timestamps, tableName: 'style_guides' });

const StoreCart = sequelize.define('StoreCart', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' }
}, { ...timestamps, tableName: 'store_carts', indexes: [{ unique: true, fields: ['userId'] }] });

const StoreCartItem = sequelize.define('StoreCartItem', {
  id,
  cartId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'store_carts', key: 'id' }, onDelete: 'CASCADE' },
  bookId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'books', key: 'id' }, onDelete: 'CASCADE' },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
}, { ...timestamps, tableName: 'store_cart_items', indexes: [{ unique: true, fields: ['cartId', 'bookId'] }] });

const StoreOrder = sequelize.define('StoreOrder', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' },
  status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  fulfillmentStatus: {
    type: DataTypes.ENUM('unfulfilled', 'processing', 'shipped', 'delivered'),
    allowNull: false,
    defaultValue: 'unfulfilled'
  },
  trackingNumber: { type: DataTypes.STRING(255), allowNull: true },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  shippingAddress: { type: DataTypes.JSON, allowNull: true },
  stripeCheckoutSessionId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  stripePaymentIntentId: { type: DataTypes.STRING(255), allowNull: true }
}, { ...timestamps, tableName: 'store_orders', indexes: [{ fields: ['userId', 'status'] }] });

const StoreOrderItem = sequelize.define('StoreOrderItem', {
  id,
  orderId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'store_orders', key: 'id' }, onDelete: 'CASCADE' },
  bookId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'books', key: 'id' }, onDelete: 'RESTRICT' },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  unitPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  titleSnapshot: { type: DataTypes.STRING(255), allowNull: false }
}, { ...timestamps, tableName: 'store_order_items' });

const Plan = sequelize.define('Plan', {
  id,
  name: { type: DataTypes.STRING(120), allowNull: false },
  slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  interval: { type: DataTypes.ENUM('month', 'year'), allowNull: false },
  features: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  translations: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
  isFamily: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  stripePriceId: { type: DataTypes.STRING(255), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { ...timestamps, tableName: 'plans' });

const Subscription = sequelize.define('Subscription', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  planId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'plans', key: 'id' }, onDelete: 'RESTRICT' },
  status: {
    type: DataTypes.ENUM('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'expired'),
    allowNull: false,
    defaultValue: 'incomplete'
  },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  gracePeriodEndsAt: { type: DataTypes.DATE, allowNull: true },
  cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  stripeCustomerId: { type: DataTypes.STRING(255), allowNull: true },
  stripeSubscriptionId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  stripeCheckoutSessionId: { type: DataTypes.STRING(255), allowNull: true, unique: true }
}, { ...timestamps, tableName: 'subscriptions', indexes: [{ fields: ['userId', 'status'] }] });

const Entitlement = sequelize.define('Entitlement', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  orderItemId: { type: DataTypes.INTEGER, allowNull: true, unique: true, references: { model: 'store_order_items', key: 'id' }, onDelete: 'SET NULL' },
  resourceType: { type: DataTypes.ENUM('collection', 'story', 'part', 'video', 'ebook', 'book'), allowNull: false },
  resourceId: { type: DataTypes.INTEGER, allowNull: false },
  startsAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  source: { type: DataTypes.ENUM('subscription', 'purchase', 'rental', 'promo', 'gift', 'event', 'admin'), allowNull: false },
  revokedAt: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'entitlements', indexes: [{ fields: ['userId', 'resourceType', 'resourceId', 'expiresAt'] }] });

const ProcessedWebhookEvent = sequelize.define('ProcessedWebhookEvent', {
  id,
  stripeEventId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  type: { type: DataTypes.STRING(120), allowNull: false },
  processedAt: { type: DataTypes.DATE, allowNull: false }
}, { ...timestamps, tableName: 'processed_webhook_events', updatedAt: false });

const ReviewerNote = sequelize.define('ReviewerNote', {
  id,
  storyId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE' },
  reviewerId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' },
  status: { type: DataTypes.ENUM('changes_requested', 'approved'), allowNull: false },
  comments: { type: DataTypes.TEXT, allowNull: false }
}, { ...timestamps, tableName: 'reviewer_notes' });

const models = {
  Collection, Story, StoryPart, StoryVideo, Quiz, Question, QuizAttempt, ReadingProgress,
  Book, MediaAsset, StyleGuide, StoreCart, StoreCartItem, StoreOrder, StoreOrderItem,
  Plan, Subscription, Entitlement, ProcessedWebhookEvent, ReviewerNote
};

Collection.hasMany(Story, { foreignKey: 'collectionId', as: 'stories' });
Story.belongsTo(Collection, { foreignKey: 'collectionId', as: 'collection' });
Story.belongsTo(sequelize.models.User, { foreignKey: 'reviewerId', as: 'reviewer' });
sequelize.models.User.hasMany(Story, { foreignKey: 'reviewerId', as: 'reviewedStories' });
Story.hasMany(StoryPart, { foreignKey: 'storyId', as: 'parts' });
StoryPart.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
Story.hasMany(StoryVideo, { foreignKey: 'storyId', as: 'videos' });
StoryVideo.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
StoryPart.hasMany(StoryVideo, { foreignKey: 'partId', as: 'videos' });
StoryVideo.belongsTo(StoryPart, { foreignKey: 'partId', as: 'part' });
Story.hasMany(Quiz, { foreignKey: 'storyId', as: 'quizzes' });
Quiz.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
StoryPart.hasMany(Quiz, { foreignKey: 'partId', as: 'quizzes' });
Quiz.belongsTo(StoryPart, { foreignKey: 'partId', as: 'part' });
Quiz.hasMany(Question, { foreignKey: 'quizId', as: 'questions' });
Question.belongsTo(Quiz, { foreignKey: 'quizId', as: 'quiz' });
Quiz.hasMany(QuizAttempt, { foreignKey: 'quizId', as: 'attempts' });
QuizAttempt.belongsTo(Quiz, { foreignKey: 'quizId', as: 'quiz' });
sequelize.models.User.hasMany(QuizAttempt, { foreignKey: 'userId', as: 'quizAttempts' });
QuizAttempt.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
Story.hasMany(ReadingProgress, { foreignKey: 'storyId', as: 'readerProgress' });
ReadingProgress.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
sequelize.models.User.hasMany(ReadingProgress, { foreignKey: 'userId', as: 'readingProgress' });
ReadingProgress.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
Collection.hasMany(Book, { foreignKey: 'collectionId', as: 'books' });
Book.belongsTo(Collection, { foreignKey: 'collectionId', as: 'collection' });
Story.hasMany(Book, { foreignKey: 'storyId', as: 'books' });
Book.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
Story.hasMany(MediaAsset, { foreignKey: 'storyId', as: 'mediaAssets' });
MediaAsset.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
StoryPart.hasMany(MediaAsset, { foreignKey: 'partId', as: 'mediaAssets' });
MediaAsset.belongsTo(StoryPart, { foreignKey: 'partId', as: 'part' });
Book.hasMany(MediaAsset, { foreignKey: 'bookId', as: 'mediaAssets' });
MediaAsset.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });
sequelize.models.User.hasMany(MediaAsset, { foreignKey: 'uploadedBy', as: 'uploadedMedia' });
MediaAsset.belongsTo(sequelize.models.User, { foreignKey: 'uploadedBy', as: 'uploader' });
sequelize.models.User.hasOne(StoreCart, { foreignKey: 'userId', as: 'storeCart' });
StoreCart.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
StoreCart.hasMany(StoreCartItem, { foreignKey: 'cartId', as: 'items' });
StoreCartItem.belongsTo(StoreCart, { foreignKey: 'cartId', as: 'cart' });
Book.hasMany(StoreCartItem, { foreignKey: 'bookId', as: 'cartItems' });
StoreCartItem.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });
sequelize.models.User.hasMany(StoreOrder, { foreignKey: 'userId', as: 'storeOrders' });
StoreOrder.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
StoreOrder.hasMany(StoreOrderItem, { foreignKey: 'orderId', as: 'items' });
StoreOrderItem.belongsTo(StoreOrder, { foreignKey: 'orderId', as: 'order' });
Book.hasMany(StoreOrderItem, { foreignKey: 'bookId', as: 'orderItems' });
StoreOrderItem.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });
StoreOrderItem.hasOne(Entitlement, { foreignKey: 'orderItemId', as: 'entitlement' });
Entitlement.belongsTo(StoreOrderItem, { foreignKey: 'orderItemId', as: 'orderItem' });
Plan.hasMany(Subscription, { foreignKey: 'planId', as: 'subscriptions' });
Subscription.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
sequelize.models.User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
Subscription.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
sequelize.models.User.hasMany(Entitlement, { foreignKey: 'userId', as: 'entitlements' });
Entitlement.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
Story.hasMany(ReviewerNote, { foreignKey: 'storyId', as: 'reviewerNotes' });
ReviewerNote.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
sequelize.models.User.hasMany(ReviewerNote, { foreignKey: 'reviewerId', as: 'reviewerNotes' });
ReviewerNote.belongsTo(sequelize.models.User, { foreignKey: 'reviewerId', as: 'reviewer' });

module.exports = models;
