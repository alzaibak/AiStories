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
  reviewChecklist: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  status: {
    type: DataTypes.ENUM('draft', 'in_review', 'published', 'rejected', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  },
  authorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  reviewerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  reviewerName: { type: DataTypes.STRING(255), allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true },
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
  mediaAssetId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'media_assets', key: 'id' },
    onDelete: 'SET NULL'
  },
  videoUrl: { type: DataTypes.STRING(1000), allowNull: true },
  title: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
  description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  subtitles: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  status: {
    type: DataTypes.ENUM('draft', 'in_review', 'published', 'rejected', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  },
  authorId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  reviewedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true },
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
  slug: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  difficulty: { type: DataTypes.ENUM('kids', 'teens', 'adults'), allowNull: false },
  passingScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
  maxAttempts: { type: DataTypes.INTEGER, allowNull: true },
  timeLimitSeconds: { type: DataTypes.INTEGER, allowNull: true },
  shuffleQuestions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  shuffleAnswers: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  showCorrectAnswersAfterSubmit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  accessMode: { type: DataTypes.ENUM('follow_part', 'free', 'premium'), allowNull: false, defaultValue: 'follow_part' },
  status: {
    type: DataTypes.ENUM('draft', 'in_review', 'published', 'rejected', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  },
  authorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  reviewedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true },
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
  type: { type: DataTypes.ENUM('single_choice', 'multiple_choice', 'true_false'), allowNull: false, defaultValue: 'single_choice' },
  text: { type: DataTypes.TEXT, allowNull: false },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  options: { type: DataTypes.JSON, allowNull: true },
  correctAnswer: { type: DataTypes.STRING(500), allowNull: true },
  points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  explanation: { type: DataTypes.TEXT, allowNull: false },
  explanationTranslations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  source: { type: DataTypes.TEXT, allowNull: true },
  sourceTranslations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { ...timestamps, tableName: 'questions', indexes: [{ fields: ['quizId', 'sortOrder'] }] });

const QuizOption = sequelize.define('QuizOption', {
  id,
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'questions', key: 'id' },
    onDelete: 'CASCADE'
  },
  text: { type: DataTypes.STRING(500), allowNull: false },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  isCorrect: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { ...timestamps, tableName: 'quiz_options', indexes: [{ unique: true, fields: ['questionId', 'sortOrder'] }] });

const QuizAttempt = sequelize.define('QuizAttempt', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  quizId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'quizzes', key: 'id' }, onDelete: 'CASCADE' },
  score: { type: DataTypes.INTEGER, allowNull: true },
  passed: { type: DataTypes.BOOLEAN, allowNull: true },
  answers: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  completedAt: { type: DataTypes.DATE, allowNull: true },
  finishedAt: { type: DataTypes.DATE, allowNull: true }
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
  isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  status: {
    type: DataTypes.ENUM('draft', 'published', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  }
}, { ...timestamps, tableName: 'books' });

const SlugRedirect = sequelize.define('SlugRedirect', {
  id,
  entityType: { type: DataTypes.ENUM('collection', 'story', 'book'), allowNull: false },
  oldSlug: { type: DataTypes.STRING(255), allowNull: false },
  newSlug: { type: DataTypes.STRING(255), allowNull: false }
}, {
  ...timestamps,
  tableName: 'slug_redirects',
  indexes: [{ unique: true, fields: ['entityType', 'oldSlug'] }]
});

const AdminPasswordReset = sequelize.define('AdminPasswordReset', {
  id,
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  ...timestamps,
  tableName: 'admin_password_resets',
  indexes: [{ fields: ['userId', 'expiresAt'] }]
});

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
  discountAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
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

const BadgeType = sequelize.define('BadgeType', {
  id,
  code: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  icon: { type: DataTypes.STRING(255), allowNull: true },
  criteria: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { ...timestamps, tableName: 'badge_types' });

const BadgeAward = sequelize.define('BadgeAward', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  badgeTypeId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'badge_types', key: 'id' }, onDelete: 'CASCADE' },
  sourceType: { type: DataTypes.ENUM('story', 'quiz', 'reading', 'custom'), allowNull: false, defaultValue: 'custom' },
  sourceId: { type: DataTypes.INTEGER, allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  awardedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { ...timestamps, tableName: 'badge_awards', indexes: [{ unique: true, fields: ['userId', 'badgeTypeId', 'sourceType', 'sourceId'] }] });

const Certificate = sequelize.define('Certificate', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  badgeTypeId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'badge_types', key: 'id' }, onDelete: 'SET NULL' },
  storyId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'stories', key: 'id' }, onDelete: 'SET NULL' },
  quizId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'quizzes', key: 'id' }, onDelete: 'SET NULL' },
  title: { type: DataTypes.STRING(255), allowNull: false },
  verificationCode: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  issuedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  pdfPath: { type: DataTypes.STRING(500), allowNull: true }
}, { ...timestamps, tableName: 'certificates' });

const StoryReview = sequelize.define('StoryReview', {
  id,
  storyId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE' },
  bookId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'books', key: 'id' }, onDelete: 'CASCADE' },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  title: { type: DataTypes.STRING(255), allowNull: true },
  body: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected', 'hidden', 'reported'), allowNull: false, defaultValue: 'pending' },
  moderationNote: { type: DataTypes.TEXT, allowNull: true },
  isVerifiedBuyer: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, { ...timestamps, tableName: 'story_reviews' });

const StoryRequest = sequelize.define('StoryRequest', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  title: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  source: { type: DataTypes.TEXT, allowNull: true },
  contactEmail: { type: DataTypes.STRING(255), allowNull: true },
  status: { type: DataTypes.ENUM('new', 'accepted', 'rejected', 'converted'), allowNull: false, defaultValue: 'new' },
  adminNotes: { type: DataTypes.TEXT, allowNull: true },
  convertedStoryId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'stories', key: 'id' }, onDelete: 'SET NULL' }
}, { ...timestamps, tableName: 'story_requests' });

const CommunityEvent = sequelize.define('CommunityEvent', {
  id,
  slug: { type: DataTypes.STRING(160), allowNull: false, unique: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  startsAt: { type: DataTypes.DATE, allowNull: false },
  endsAt: { type: DataTypes.DATE, allowNull: false },
  winnerDisplayName: { type: DataTypes.STRING(120), allowNull: true },
  winnerAnnouncement: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  status: { type: DataTypes.ENUM('draft', 'published', 'completed', 'cancelled'), allowNull: false, defaultValue: 'draft' },
  quizId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'quizzes', key: 'id' }, onDelete: 'SET NULL' }
}, { ...timestamps, tableName: 'community_events' });

const EventEntry = sequelize.define('EventEntry', {
  id,
  eventId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'community_events', key: 'id' }, onDelete: 'CASCADE' },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }
}, { ...timestamps, tableName: 'event_entries', indexes: [{ unique: true, fields: ['eventId', 'userId'] }] });

const Team = sequelize.define('Team', {
  id,
  ownerId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  name: { type: DataTypes.STRING(120), allowNull: false },
  inviteCode: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { ...timestamps, tableName: 'teams' });

const TeamMember = sequelize.define('TeamMember', {
  id,
  teamId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'teams', key: 'id' }, onDelete: 'CASCADE' },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  displayName: { type: DataTypes.STRING(80), allowNull: false },
  role: { type: DataTypes.ENUM('owner', 'member'), allowNull: false, defaultValue: 'member' }
}, { ...timestamps, tableName: 'team_members', indexes: [{ unique: true, fields: ['teamId', 'userId'] }, { unique: true, fields: ['userId'] }] });

const DonationCampaign = sequelize.define('DonationCampaign', {
  id,
  slug: { type: DataTypes.STRING(160), allowNull: false, unique: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  goalAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  status: { type: DataTypes.ENUM('draft', 'active', 'completed', 'archived'), allowNull: false, defaultValue: 'draft' },
  startsAt: { type: DataTypes.DATE, allowNull: true },
  endsAt: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'donation_campaigns' });

const Donation = sequelize.define('Donation', {
  id,
  campaignId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'donation_campaigns', key: 'id' }, onDelete: 'RESTRICT' },
  recurringDonationId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'recurring_donations', key: 'id' }, onDelete: 'SET NULL' },
  userId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'), allowNull: false, defaultValue: 'pending' },
  stripeCheckoutSessionId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  stripeInvoiceId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  stripePaymentIntentId: { type: DataTypes.STRING(255), allowNull: true }
}, { ...timestamps, tableName: 'donations' });

const RecurringDonation = sequelize.define('RecurringDonation', {
  id,
  campaignId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'donation_campaigns', key: 'id' }, onDelete: 'RESTRICT' },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'active', 'past_due', 'canceled', 'expired'), allowNull: false, defaultValue: 'pending' },
  cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  stripeCheckoutSessionId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  stripeSubscriptionId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  stripeCustomerId: { type: DataTypes.STRING(255), allowNull: true }
}, { ...timestamps, tableName: 'recurring_donations' });

const PromoCode = sequelize.define('PromoCode', {
  id,
  code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  kind: { type: DataTypes.ENUM('percentage', 'fixed', 'gift'), allowNull: false },
  appliesTo: { type: DataTypes.ENUM('all', 'books', 'plans'), allowNull: false, defaultValue: 'all' },
  value: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  startsAt: { type: DataTypes.DATE, allowNull: true },
  endsAt: { type: DataTypes.DATE, allowNull: true },
  maxUses: { type: DataTypes.INTEGER, allowNull: true },
  usedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  perUserLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  applicableBookIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  applicablePlanIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  giftPlanId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'plans', key: 'id' }, onDelete: 'SET NULL' },
  giftDurationDays: { type: DataTypes.INTEGER, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { ...timestamps, tableName: 'promo_codes' });

const PromoCodeRedemption = sequelize.define('PromoCodeRedemption', {
  id,
  promoCodeId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'promo_codes', key: 'id' }, onDelete: 'RESTRICT' },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  orderId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'store_orders', key: 'id' }, onDelete: 'SET NULL' },
  subscriptionId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'subscriptions', key: 'id' }, onDelete: 'SET NULL' },
  status: { type: DataTypes.ENUM('pending', 'redeemed', 'released'), allowNull: false, defaultValue: 'pending' },
  amountDiscounted: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  stripeCheckoutSessionId: { type: DataTypes.STRING(255), allowNull: true, unique: true }
}, {
  ...timestamps,
  tableName: 'promo_code_redemptions',
  indexes: [{ fields: ['promoCodeId', 'userId', 'status'] }]
});

const EmailTemplate = sequelize.define('EmailTemplate', {
  id,
  code: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { ...timestamps, tableName: 'email_templates' });

const ScheduledReminder = sequelize.define('ScheduledReminder', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  code: { type: DataTypes.STRING(100), allowNull: false },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  sentAt: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.ENUM('pending', 'sent', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }
}, { ...timestamps, tableName: 'scheduled_reminders', indexes: [{ fields: ['status', 'scheduledAt'] }] });

const PolicyPage = sequelize.define('PolicyPage', {
  id,
  code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  updatedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' }
}, { ...timestamps, tableName: 'policy_pages' });

const models = {
  Collection, Story, StoryPart, StoryVideo, Quiz, Question, QuizOption, QuizAttempt, ReadingProgress,
  Book, SlugRedirect, AdminPasswordReset, MediaAsset, StyleGuide, StoreCart, StoreCartItem, StoreOrder, StoreOrderItem,
  Plan, Subscription, Entitlement, ProcessedWebhookEvent, ReviewerNote, BadgeType, BadgeAward, Certificate, StoryReview, StoryRequest,
  CommunityEvent, EventEntry, Team, TeamMember, DonationCampaign, Donation, RecurringDonation, PromoCode, PromoCodeRedemption,
  EmailTemplate, ScheduledReminder, PolicyPage
};

Collection.hasMany(Story, { foreignKey: 'collectionId', as: 'stories' });
Story.belongsTo(Collection, { foreignKey: 'collectionId', as: 'collection' });
Story.belongsTo(sequelize.models.User, { foreignKey: 'reviewerId', as: 'reviewer' });
Story.belongsTo(sequelize.models.User, { foreignKey: 'authorId', as: 'author' });
sequelize.models.User.hasMany(Story, { foreignKey: 'reviewerId', as: 'reviewedStories' });
Story.hasMany(StoryPart, { foreignKey: 'storyId', as: 'parts' });
StoryPart.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
Story.hasMany(StoryVideo, { foreignKey: 'storyId', as: 'videos' });
StoryVideo.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
StoryVideo.belongsTo(MediaAsset, { foreignKey: 'mediaAssetId', as: 'mediaAsset' });
MediaAsset.hasMany(StoryVideo, { foreignKey: 'mediaAssetId', as: 'storyVideos' });
StoryVideo.belongsTo(sequelize.models.User, { foreignKey: 'authorId', as: 'author' });
StoryVideo.belongsTo(sequelize.models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
StoryPart.hasMany(StoryVideo, { foreignKey: 'partId', as: 'videos' });
StoryVideo.belongsTo(StoryPart, { foreignKey: 'partId', as: 'part' });
Story.hasMany(Quiz, { foreignKey: 'storyId', as: 'quizzes' });
Quiz.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
Quiz.belongsTo(sequelize.models.User, { foreignKey: 'authorId', as: 'author' });
Quiz.belongsTo(sequelize.models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
StoryPart.hasMany(Quiz, { foreignKey: 'partId', as: 'quizzes' });
Quiz.belongsTo(StoryPart, { foreignKey: 'partId', as: 'part' });
Quiz.hasMany(Question, { foreignKey: 'quizId', as: 'questions' });
Question.belongsTo(Quiz, { foreignKey: 'quizId', as: 'quiz' });
Question.hasMany(QuizOption, { foreignKey: 'questionId', as: 'answerOptions' });
QuizOption.belongsTo(Question, { foreignKey: 'questionId', as: 'question' });
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

BadgeType.hasMany(BadgeAward, { foreignKey: 'badgeTypeId', as: 'awards' });
BadgeAward.belongsTo(BadgeType, { foreignKey: 'badgeTypeId', as: 'badgeType' });
sequelize.models.User.hasMany(BadgeAward, { foreignKey: 'userId', as: 'badgeAwards' });
BadgeAward.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
sequelize.models.User.hasMany(Certificate, { foreignKey: 'userId', as: 'certificates' });
Certificate.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
BadgeType.hasMany(Certificate, { foreignKey: 'badgeTypeId', as: 'certificates' });
Certificate.belongsTo(BadgeType, { foreignKey: 'badgeTypeId', as: 'badgeType' });
Story.hasMany(Certificate, { foreignKey: 'storyId', as: 'certificates' });
Certificate.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
Quiz.hasMany(Certificate, { foreignKey: 'quizId', as: 'certificates' });
Certificate.belongsTo(Quiz, { foreignKey: 'quizId', as: 'quiz' });
Story.hasMany(StoryReview, { foreignKey: 'storyId', as: 'reviews' });
Book.hasMany(StoryReview, { foreignKey: 'bookId', as: 'reviews' });
StoryReview.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
StoryReview.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });
sequelize.models.User.hasMany(StoryReview, { foreignKey: 'userId', as: 'reviews' });
StoryReview.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
sequelize.models.User.hasMany(StoryRequest, { foreignKey: 'userId', as: 'storyRequests' });
StoryRequest.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
Story.hasMany(StoryRequest, { foreignKey: 'convertedStoryId', as: 'convertedRequests' });
StoryRequest.belongsTo(Story, { foreignKey: 'convertedStoryId', as: 'convertedStory' });
CommunityEvent.belongsTo(Quiz, { foreignKey: 'quizId', as: 'quiz' });
CommunityEvent.hasMany(EventEntry, { foreignKey: 'eventId', as: 'entries' });
EventEntry.belongsTo(CommunityEvent, { foreignKey: 'eventId', as: 'event' });
sequelize.models.User.hasMany(EventEntry, { foreignKey: 'userId', as: 'eventEntries' });
EventEntry.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
Team.hasMany(TeamMember, { foreignKey: 'teamId', as: 'members' });
TeamMember.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });
sequelize.models.User.hasMany(TeamMember, { foreignKey: 'userId', as: 'teamMembership' });
TeamMember.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
DonationCampaign.hasMany(Donation, { foreignKey: 'campaignId', as: 'donations' });
Donation.belongsTo(DonationCampaign, { foreignKey: 'campaignId', as: 'campaign' });
DonationCampaign.hasMany(RecurringDonation, { foreignKey: 'campaignId', as: 'recurringDonations' });
RecurringDonation.belongsTo(DonationCampaign, { foreignKey: 'campaignId', as: 'campaign' });
RecurringDonation.hasMany(Donation, { foreignKey: 'recurringDonationId', as: 'payments' });
Donation.belongsTo(RecurringDonation, { foreignKey: 'recurringDonationId', as: 'recurringDonation' });
sequelize.models.User.hasMany(Donation, { foreignKey: 'userId', as: 'donations' });
Donation.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
sequelize.models.User.hasMany(RecurringDonation, { foreignKey: 'userId', as: 'recurringDonations' });
RecurringDonation.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
PromoCode.hasMany(PromoCodeRedemption, { foreignKey: 'promoCodeId', as: 'redemptions' });
PromoCodeRedemption.belongsTo(PromoCode, { foreignKey: 'promoCodeId', as: 'promoCode' });
PromoCodeRedemption.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });
PromoCodeRedemption.belongsTo(StoreOrder, { foreignKey: 'orderId', as: 'order' });
PromoCodeRedemption.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
sequelize.models.User.hasMany(ScheduledReminder, { foreignKey: 'userId', as: 'scheduledReminders' });
ScheduledReminder.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user' });

module.exports = models;
