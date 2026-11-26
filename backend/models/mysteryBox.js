const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const id = {
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true
};
const timestamps = { timestamps: true };
// A fresh definition per attribute: Sequelize mutates these objects, so sharing
// one instance makes attributes collide on the same database column.
const money = () => ({ type: DataTypes.DECIMAL(10, 2), allowNull: true });

/*
 * Mystery boxes are deliberately explicit: every buyer receives the same list
 * of MysteryBoxItem rows. `allowRandomItems` exists only so a future feature
 * can opt in, and is intentionally not read by any code path.
 */
const MysteryBox = sequelize.define('MysteryBox', {
  id,
  slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  title: { type: DataTypes.STRING(255), allowNull: false },
  tagline: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
  seasonLabel: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'active', 'ended', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  },
  startAt: { type: DataTypes.DATE, allowNull: true },
  endAt: { type: DataTypes.DATE, allowNull: true },
  timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'Europe/Paris' },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  price: money(),
  earlyBirdPrice: money(),
  earlyBirdEndsAt: { type: DataTypes.DATE, allowNull: true },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  compareAtValue: money(),
  stockLimit: { type: DataTypes.INTEGER, allowNull: true },
  stockSold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  stockReserved: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  perUserLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  revealMode: {
    type: DataTypes.ENUM('hidden_until_purchase', 'teaser', 'full'),
    allowNull: false,
    defaultValue: 'teaser'
  },
  description: { type: DataTypes.TEXT, allowNull: true },
  // Admin-authored promo blocks (texts and images) rendered on the public box
  // page: [{ type: 'text' | 'image', title, body, imageUrl, imageAlt }] where
  // title/body are keyed by language ({ ar, en, fr }).
  promoBlocks: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  digitalConsentText: { type: DataTypes.TEXT, allowNull: true },
  faq: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  termsText: { type: DataTypes.TEXT, allowNull: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  requiresShipping: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Physical items of a box are never returnable unless the admin opts into
  // the standard return rules for this box.
  returnPolicy: {
    type: DataTypes.ENUM('none', 'standard'),
    allowNull: false,
    defaultValue: 'none'
  },
  allowRandomItems: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  viewCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  headerClickCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, {
  ...timestamps,
  tableName: 'mystery_boxes',
  indexes: [
    { fields: ['status', 'startAt', 'endAt'] },
    { fields: ['priority'] }
  ]
});

const MysteryBoxItem = sequelize.define('MysteryBoxItem', {
  id,
  boxId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'mystery_boxes', key: 'id' },
    onDelete: 'CASCADE'
  },
  type: {
    type: DataTypes.ENUM(
      'ebook', 'printed_book', 'physical_object', 'story_rental', 'premium_access_days',
      'badge', 'certificate', 'digital_extra', 'promo_coupon', 'sponsored_book_donation'
    ),
    allowNull: false
  },
  referenceId: { type: DataTypes.INTEGER, allowNull: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  durationDays: { type: DataTypes.INTEGER, allowNull: true },
  displayName: { type: DataTypes.STRING(255), allowNull: false },
  teaserText: { type: DataTypes.STRING(500), allowNull: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  estimatedValue: money(),
  imageUrl: { type: DataTypes.STRING(1000), allowNull: true },
  isHiddenBeforePurchase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  weightGrams: { type: DataTypes.INTEGER, allowNull: true },
  itemStock: { type: DataTypes.INTEGER, allowNull: true },
  sku: { type: DataTypes.STRING(120), allowNull: true }
}, {
  ...timestamps,
  tableName: 'mystery_box_items',
  indexes: [{ fields: ['boxId', 'sortOrder'] }]
});

const MysteryBoxShipping = sequelize.define('MysteryBoxShipping', {
  id,
  boxId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: 'mystery_boxes', key: 'id' },
    onDelete: 'CASCADE'
  },
  shippingFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  freeShippingThreshold: money(),
  allowedCountries: { type: DataTypes.JSON, allowNull: false, defaultValue: ['FR'] },
  feeByCountry: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  estimatedDeliveryMinDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
  estimatedDeliveryMaxDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
  carrier: { type: DataTypes.STRING(120), allowNull: true },
  shippingNote: { type: DataTypes.TEXT, allowNull: true },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  shipsFrom: { type: DataTypes.STRING(255), allowNull: true },
  shippingStartDate: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'mystery_box_shipping' });

const MysteryBoxAppearance = sequelize.define('MysteryBoxAppearance', {
  id,
  boxId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: 'mystery_boxes', key: 'id' },
    onDelete: 'CASCADE'
  },
  headerLabel: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
  translations: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  icon: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '🎁' },
  colorFrom: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#10523C' },
  colorTo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#C5A25A' },
  accentColor: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#F3E3B8' },
  animationStyle: {
    type: DataTypes.ENUM('shimmer', 'pulse', 'sparkle', 'none'),
    allowNull: false,
    defaultValue: 'shimmer'
  },
  showCountdownInHeader: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  almostSoldOutThreshold: { type: DataTypes.INTEGER, allowNull: true },
  bannerImage: { type: DataTypes.STRING(1000), allowNull: true },
  seasonPatternStyle: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'girih' }
}, { ...timestamps, tableName: 'mystery_box_appearance' });

const MysteryBoxPurchase = sequelize.define('MysteryBoxPurchase', {
  id,
  boxId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'mystery_boxes', key: 'id' },
    onDelete: 'RESTRICT'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'RESTRICT'
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'store_orders', key: 'id' },
    onDelete: 'SET NULL'
  },
  stripeCheckoutSessionId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  stripePaymentIntentId: { type: DataTypes.STRING(255), allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'fulfilled', 'partially_fulfilled', 'refunded', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending'
  },
  amountItems: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  amountShipping: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  amountTotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  priceTier: {
    type: DataTypes.ENUM('standard', 'early_bird'),
    allowNull: false,
    defaultValue: 'standard'
  },
  shippingAddress: { type: DataTypes.JSON, allowNull: true },
  digitalContentConsent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  digitalContentConsentAt: { type: DataTypes.DATE, allowNull: true },
  itemsFulfillment: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  boxSnapshot: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  shippingStatus: {
    type: DataTypes.ENUM('to_ship', 'shipped', 'delivered', 'returned'),
    allowNull: true
  },
  trackingNumber: { type: DataTypes.STRING(255), allowNull: true },
  carrier: { type: DataTypes.STRING(120), allowNull: true },
  shippedAt: { type: DataTypes.DATE, allowNull: true },
  deliveredAt: { type: DataTypes.DATE, allowNull: true },
  returnPolicySnapshot: {
    type: DataTypes.ENUM('none', 'standard'),
    allowNull: true
  },
  returnNeeded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  revealedAt: { type: DataTypes.DATE, allowNull: true },
  reservationExpiresAt: { type: DataTypes.DATE, allowNull: true }
}, {
  ...timestamps,
  tableName: 'mystery_box_purchases',
  indexes: [
    { fields: ['boxId', 'status'] },
    { fields: ['userId', 'boxId', 'status'] },
    { fields: ['reservationExpiresAt'] }
  ]
});

const MysteryBoxNotifyRequest = sequelize.define('MysteryBoxNotifyRequest', {
  id,
  boxId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'mystery_boxes', key: 'id' },
    onDelete: 'CASCADE'
  },
  email: { type: DataTypes.STRING(255), allowNull: false },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  language: { type: DataTypes.ENUM('ar', 'en', 'fr'), allowNull: false, defaultValue: 'ar' },
  notifiedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  ...timestamps,
  tableName: 'mystery_box_notify_requests',
  indexes: [{ unique: true, fields: ['boxId', 'email'] }]
});

MysteryBox.hasMany(MysteryBoxItem, { foreignKey: 'boxId', as: 'items' });
MysteryBoxItem.belongsTo(MysteryBox, { foreignKey: 'boxId', as: 'box' });
MysteryBox.hasOne(MysteryBoxShipping, { foreignKey: 'boxId', as: 'shipping' });
MysteryBoxShipping.belongsTo(MysteryBox, { foreignKey: 'boxId', as: 'box' });
MysteryBox.hasOne(MysteryBoxAppearance, { foreignKey: 'boxId', as: 'appearance' });
MysteryBoxAppearance.belongsTo(MysteryBox, { foreignKey: 'boxId', as: 'box' });
MysteryBox.hasMany(MysteryBoxPurchase, { foreignKey: 'boxId', as: 'purchases' });
MysteryBoxPurchase.belongsTo(MysteryBox, { foreignKey: 'boxId', as: 'box' });
User.hasMany(MysteryBoxPurchase, { foreignKey: 'userId', as: 'mysteryBoxPurchases' });
MysteryBoxPurchase.belongsTo(User, { foreignKey: 'userId', as: 'user' });
MysteryBox.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
MysteryBox.hasMany(MysteryBoxNotifyRequest, { foreignKey: 'boxId', as: 'notifyRequests' });
MysteryBoxNotifyRequest.belongsTo(MysteryBox, { foreignKey: 'boxId', as: 'box' });

if (sequelize.models.Entitlement) {
  MysteryBoxPurchase.hasMany(sequelize.models.Entitlement, {
    foreignKey: 'mysteryBoxPurchaseId',
    as: 'entitlements',
    constraints: false
  });
  sequelize.models.Entitlement.belongsTo(MysteryBoxPurchase, {
    foreignKey: 'mysteryBoxPurchaseId',
    as: 'mysteryBoxPurchase',
    constraints: false
  });
}

module.exports = {
  MysteryBox,
  MysteryBoxItem,
  MysteryBoxShipping,
  MysteryBoxAppearance,
  MysteryBoxPurchase,
  MysteryBoxNotifyRequest
};
