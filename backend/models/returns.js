const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const id = {
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true
};
const timestamps = { timestamps: true };
const money = () => ({ type: DataTypes.DECIMAL(10, 2), allowNull: true });

/*
 * Singleton row (id = 1) holding the return policy that applies to new returns.
 * Every order item keeps its own snapshot, so editing this row never rewrites
 * the rules of an order that was already placed.
 */
const ReturnPolicySettings = sequelize.define('ReturnPolicySettings', {
  id,
  returnsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  defaultReturnWindowDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
  legalWithdrawalDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 14 },
  applyLegalWithdrawalRules: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  deliveryDeductionMode: {
    type: DataTypes.ENUM('defined_fee', 'fee_paid'),
    allowNull: false,
    defaultValue: 'defined_fee'
  },
  returnShippingPayer: {
    type: DataTypes.ENUM('customer', 'prepaid_label'),
    allowNull: false,
    defaultValue: 'customer'
  },
  returnAddress: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  shipBackDeadlineDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 14 },
  refundDeadlineDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 14 },
  autoApproveRequests: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  autoRefundAfterAcceptance: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  requirePhotosForDefects: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  maxReturnsPerUserPerYear: { type: DataTypes.INTEGER, allowNull: true },
  defaultDeliveryEstimateDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
  reasons: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  policyText: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  conditionText: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  emailTemplates: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  updatedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, { ...timestamps, tableName: 'return_policy_settings' });

const RETURN_STATUSES = [
  'requested', 'approved', 'rejected', 'awaiting_shipment', 'shipped_back', 'received',
  'inspected', 'refund_pending', 'refunded', 'closed', 'cancelled', 'expired'
];

const ReturnRequest = sequelize.define('ReturnRequest', {
  id,
  rmaNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'store_orders', key: 'id' },
    onDelete: 'CASCADE'
  },
  mysteryBoxPurchaseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'mystery_box_purchases', key: 'id' },
    onDelete: 'SET NULL'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'RESTRICT'
  },
  reason: { type: DataTypes.STRING(80), allowNull: false },
  reasonDetails: { type: DataTypes.TEXT, allowNull: true },
  isSellerFault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  status: { type: DataTypes.ENUM(...RETURN_STATUSES), allowNull: false, defaultValue: 'requested' },
  requestedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  windowStartAt: { type: DataTypes.DATE, allowNull: true },
  windowEndAt: { type: DataTypes.DATE, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  rejectedAt: { type: DataTypes.DATE, allowNull: true },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true },
  shipBackDeadline: { type: DataTypes.DATE, allowNull: true },
  trackingNumber: { type: DataTypes.STRING(255), allowNull: true },
  carrier: { type: DataTypes.STRING(120), allowNull: true },
  shippedBackAt: { type: DataTypes.DATE, allowNull: true },
  receivedAt: { type: DataTypes.DATE, allowNull: true },
  inspectedAt: { type: DataTypes.DATE, allowNull: true },
  inspectionResult: {
    type: DataTypes.ENUM('accepted', 'partial', 'rejected'),
    allowNull: true
  },
  inspectionNotes: { type: DataTypes.TEXT, allowNull: true },
  photos: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  refundAmount: money(),
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  refundedAt: { type: DataTypes.DATE, allowNull: true },
  closedAt: { type: DataTypes.DATE, allowNull: true },
  cancelledAt: { type: DataTypes.DATE, allowNull: true },
  expiredAt: { type: DataTypes.DATE, allowNull: true },
  internalNotes: { type: DataTypes.TEXT, allowNull: true },
  createdByAdminId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, {
  ...timestamps,
  tableName: 'return_requests',
  indexes: [
    { fields: ['userId', 'status'] },
    { fields: ['orderId'] },
    { fields: ['status', 'shipBackDeadline'] }
  ]
});

const ReturnItem = sequelize.define('ReturnItem', {
  id,
  returnRequestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'return_requests', key: 'id' },
    onDelete: 'CASCADE'
  },
  sourceType: {
    type: DataTypes.ENUM('order_item', 'mystery_box_item'),
    allowNull: false,
    defaultValue: 'order_item'
  },
  orderItemId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'store_order_items', key: 'id' },
    onDelete: 'SET NULL'
  },
  mysteryBoxItemId: { type: DataTypes.INTEGER, allowNull: true },
  titleSnapshot: { type: DataTypes.STRING(255), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  itemPricePaid: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  deliveryFeeDeduction: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  refundAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  calculationBreakdown: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }
}, { ...timestamps, tableName: 'return_items', indexes: [{ fields: ['returnRequestId'] }] });

const ReturnRefund = sequelize.define('ReturnRefund', {
  id,
  returnRequestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'return_requests', key: 'id' },
    onDelete: 'CASCADE'
  },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  paymentIntentId: { type: DataTypes.STRING(255), allowNull: true },
  stripeRefundId: { type: DataTypes.STRING(255), allowNull: true },
  idempotencyKey: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  status: { type: DataTypes.ENUM('pending', 'succeeded', 'failed'), allowNull: false, defaultValue: 'pending' },
  issuedAt: { type: DataTypes.DATE, allowNull: true },
  failureReason: { type: DataTypes.TEXT, allowNull: true },
  createdByAdminId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, { ...timestamps, tableName: 'return_refunds', indexes: [{ fields: ['returnRequestId'] }] });

const ReturnEvent = sequelize.define('ReturnEvent', {
  id,
  returnRequestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'return_requests', key: 'id' },
    onDelete: 'CASCADE'
  },
  actorType: { type: DataTypes.ENUM('customer', 'admin', 'system'), allowNull: false },
  actorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  eventType: { type: DataTypes.STRING(80), allowNull: false },
  note: { type: DataTypes.TEXT, allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }
}, { ...timestamps, tableName: 'return_events', updatedAt: false, indexes: [{ fields: ['returnRequestId'] }] });

const User = sequelize.models.User;
const StoreOrder = sequelize.models.StoreOrder;
const StoreOrderItem = sequelize.models.StoreOrderItem;
const { MysteryBoxPurchase } = require('./mysteryBox');

User.hasMany(ReturnRequest, { foreignKey: 'userId', as: 'returnRequests' });
ReturnRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });
StoreOrder.hasMany(ReturnRequest, { foreignKey: 'orderId', as: 'returnRequests' });
ReturnRequest.belongsTo(StoreOrder, { foreignKey: 'orderId', as: 'order' });
MysteryBoxPurchase.hasMany(ReturnRequest, { foreignKey: 'mysteryBoxPurchaseId', as: 'returnRequests' });
ReturnRequest.belongsTo(MysteryBoxPurchase, { foreignKey: 'mysteryBoxPurchaseId', as: 'mysteryBoxPurchase' });
ReturnRequest.hasMany(ReturnItem, { foreignKey: 'returnRequestId', as: 'items' });
ReturnItem.belongsTo(ReturnRequest, { foreignKey: 'returnRequestId', as: 'returnRequest' });
StoreOrderItem.hasMany(ReturnItem, { foreignKey: 'orderItemId', as: 'returnItems' });
ReturnItem.belongsTo(StoreOrderItem, { foreignKey: 'orderItemId', as: 'orderItem' });
ReturnRequest.hasMany(ReturnRefund, { foreignKey: 'returnRequestId', as: 'refunds' });
ReturnRefund.belongsTo(ReturnRequest, { foreignKey: 'returnRequestId', as: 'returnRequest' });
ReturnRequest.hasMany(ReturnEvent, { foreignKey: 'returnRequestId', as: 'events' });
ReturnEvent.belongsTo(ReturnRequest, { foreignKey: 'returnRequestId', as: 'returnRequest' });

module.exports = {
  RETURN_STATUSES,
  ReturnPolicySettings,
  ReturnRequest,
  ReturnItem,
  ReturnRefund,
  ReturnEvent
};
