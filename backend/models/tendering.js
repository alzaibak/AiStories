const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const id = {
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true
};
const timestamps = { timestamps: true, paranoid: true };

const Organization = sequelize.define('Organization', {
  id,
  type: { type: DataTypes.ENUM('BUYER', 'SELLER'), allowNull: false },
  legalName: { type: DataTypes.STRING(255), allowNull: false },
  country: { type: DataTypes.STRING(120), allowNull: false },
  address: { type: DataTypes.TEXT, allowNull: false },
  registrationNumber: { type: DataTypes.STRING(120), allowNull: false },
  pharmaceuticalLicense: { type: DataTypes.STRING(255), allowNull: true },
  verificationStatus: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  internalAdminNote: { type: DataTypes.TEXT, allowNull: true }
}, { ...timestamps, tableName: 'organizations', indexes: [
  { fields: ['type', 'verificationStatus'] },
  { unique: true, fields: ['type', 'registrationNumber'] }
] });

const Tender = sequelize.define('Tender', {
  id,
  reference: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  buyerOrgId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'organizations', key: 'id' }
  },
  title: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  categoryId: {
    type: DataTypes.INTEGER, allowNull: true,
    references: { model: 'categories', key: 'id' },
    onDelete: 'SET NULL'
  },
  deliveryCountry: { type: DataTypes.STRING(120), allowNull: false },
  deliveryRegion: { type: DataTypes.STRING(180), allowNull: true },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  deadline: { type: DataTypes.DATE, allowNull: false },
  type: { type: DataTypes.ENUM('NORMAL', 'URGENT'), allowNull: false, defaultValue: 'NORMAL' },
  status: {
    type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'IN_NEGOTIATION', 'AWARDED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'DRAFT'
  },
  visibility: { type: DataTypes.ENUM('PUBLIC', 'INVITATION_ONLY'), allowNull: false, defaultValue: 'PUBLIC' },
  sealedOffers: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  requiredDocuments: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  voiceRecordingUrl: { type: DataTypes.STRING(1000), allowNull: true },
  attachmentUrls: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  createdBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } }
}, { ...timestamps, tableName: 'tenders', indexes: [
  { fields: ['buyerOrgId', 'status'] },
  { fields: ['status', 'deadline'] },
  { fields: ['visibility', 'publishedAt'] }
] });

const TenderItem = sequelize.define('TenderItem', {
  id,
  tenderId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'tenders', key: 'id' }, onDelete: 'CASCADE'
  },
  genericName: { type: DataTypes.STRING(255), allowNull: false },
  dosage: { type: DataTypes.STRING(120), allowNull: false },
  dosageForm: { type: DataTypes.STRING(120), allowNull: false },
  packaging: { type: DataTypes.STRING(255), allowNull: true },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  unit: { type: DataTypes.STRING(60), allowNull: false },
  remarks: { type: DataTypes.TEXT, allowNull: true }
}, { ...timestamps, tableName: 'tender_items', indexes: [{ fields: ['tenderId'] }] });

const TenderInvitation = sequelize.define('TenderInvitation', {
  id,
  tenderId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'tenders', key: 'id' }, onDelete: 'CASCADE'
  },
  sellerOrgId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'organizations', key: 'id' }, onDelete: 'CASCADE'
  },
  status: {
    type: DataTypes.ENUM('INVITED', 'VIEWED', 'RESPONDED', 'DECLINED'),
    allowNull: false, defaultValue: 'INVITED'
  }
}, { ...timestamps, tableName: 'tender_invitations', indexes: [
  { unique: true, fields: ['tenderId', 'sellerOrgId'] },
  { fields: ['sellerOrgId', 'status'] }
] });

const Offer = sequelize.define('Offer', {
  id,
  tenderId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'tenders', key: 'id' }, onDelete: 'CASCADE'
  },
  sellerOrgId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'organizations', key: 'id' }
  },
  status: {
    type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'SHORTLISTED', 'REJECTED', 'WON', 'WITHDRAWN'),
    allowNull: false, defaultValue: 'DRAFT'
  },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'EUR' },
  totalAmount: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
  deliveryDays: { type: DataTypes.INTEGER, allowNull: false },
  validityDays: { type: DataTypes.INTEGER, allowNull: false },
  incoterm: { type: DataTypes.ENUM('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'), allowNull: false },
  paymentTerms: { type: DataTypes.STRING(255), allowNull: false },
  comment: { type: DataTypes.TEXT, allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'offers', indexes: [
  { unique: true, fields: ['tenderId', 'sellerOrgId'] },
  { fields: ['sellerOrgId', 'status'] },
  { fields: ['tenderId', 'status'] }
] });

const OfferItem = sequelize.define('OfferItem', {
  id,
  offerId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'offers', key: 'id' }, onDelete: 'CASCADE'
  },
  tenderItemId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'tender_items', key: 'id' }
  },
  productId: {
    type: DataTypes.INTEGER, allowNull: true,
    references: { model: 'products', key: 'id' }, onDelete: 'SET NULL'
  },
  unitPrice: { type: DataTypes.DECIMAL(16, 4), allowNull: false },
  moq: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 1 },
  availableQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  lineTotal: { type: DataTypes.DECIMAL(16, 2), allowNull: false },
  batchNumber: { type: DataTypes.STRING(120), allowNull: true },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true }
}, { ...timestamps, tableName: 'offer_items', indexes: [
  { unique: true, fields: ['offerId', 'tenderItemId'] }
] });

const Document = sequelize.define('Document', {
  id,
  ownerOrgId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'organizations', key: 'id' }
  },
  offerId: {
    type: DataTypes.INTEGER, allowNull: true,
    references: { model: 'offers', key: 'id' }, onDelete: 'CASCADE'
  },
  productId: {
    type: DataTypes.INTEGER, allowNull: true,
    references: { model: 'products', key: 'id' }, onDelete: 'CASCADE'
  },
  tenderId: {
    type: DataTypes.INTEGER, allowNull: true,
    references: { model: 'tenders', key: 'id' }, onDelete: 'CASCADE'
  },
  type: {
    type: DataTypes.ENUM('QUOTATION', 'COA', 'GMP', 'ORIGIN_CERTIFICATE', 'RCP', 'AMM', 'OTHER'),
    allowNull: false
  },
  fileName: { type: DataTypes.STRING(255), allowNull: false },
  fileUrl: { type: DataTypes.STRING(1000), allowNull: true },
  storageKey: { type: DataTypes.STRING(1024), allowNull: true },
  fileSize: { type: DataTypes.BIGINT, allowNull: false },
  mimeType: { type: DataTypes.STRING(150), allowNull: false },
  uploadedAt: { type: DataTypes.DATE, allowNull: true },
  expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
  verificationStatus: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'),
    allowNull: false, defaultValue: 'PENDING'
  }
}, { ...timestamps, tableName: 'documents', indexes: [
  { fields: ['ownerOrgId', 'type', 'verificationStatus'] }
] });

const Clarification = sequelize.define('Clarification', {
  id,
  tenderId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'tenders', key: 'id' }, onDelete: 'CASCADE'
  },
  authorUserId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  question: { type: DataTypes.TEXT, allowNull: false },
  answer: { type: DataTypes.TEXT, allowNull: true },
  answeredBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  answeredAt: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'clarifications', indexes: [{ fields: ['tenderId', 'createdAt'] }] });

const Message = sequelize.define('Message', {
  id,
  tenderId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'tenders', key: 'id' }, onDelete: 'CASCADE'
  },
  offerId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'offers', key: 'id' }, onDelete: 'CASCADE'
  },
  senderUserId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  recipientUserId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  body: { type: DataTypes.TEXT, allowNull: false },
  readAt: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'messages', indexes: [
  { fields: ['offerId', 'createdAt'] },
  { fields: ['recipientUserId', 'readAt'] }
] });

const PurchaseOrder = sequelize.define('PurchaseOrder', {
  id,
  tenderId: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'tenders', key: 'id' }
  },
  offerId: {
    type: DataTypes.INTEGER, allowNull: false, unique: true,
    references: { model: 'offers', key: 'id' }
  },
  number: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  status: {
    type: DataTypes.ENUM('DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED'),
    allowNull: false, defaultValue: 'ISSUED'
  },
  amount: { type: DataTypes.DECIMAL(16, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false },
  terms: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  createdBy: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } }
}, { ...timestamps, tableName: 'purchase_orders', indexes: [{ fields: ['tenderId', 'status'] }] });

const AuditLog = sequelize.define('AuditLog', {
  id,
  userId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  organizationId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'organizations', key: 'id' }, onDelete: 'SET NULL' },
  action: { type: DataTypes.STRING(120), allowNull: false },
  entityType: { type: DataTypes.STRING(80), allowNull: false },
  entityId: { type: DataTypes.STRING(80), allowNull: true },
  ipAddress: { type: DataTypes.STRING(45), allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }
}, { ...timestamps, tableName: 'audit_logs', updatedAt: false, indexes: [
  { fields: ['userId', 'createdAt'] },
  { fields: ['entityType', 'entityId'] }
] });

const EmailAuthChallenge = sequelize.define('EmailAuthChallenge', {
  id,
  email: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('ADMIN', 'EDITOR', 'REVIEWER', 'READER', 'BUYER', 'SELLER'), allowNull: false },
  purpose: { type: DataTypes.ENUM('REGISTER', 'ADMIN_REGISTER', 'ADMIN_LOGIN', 'VERIFY_EMAIL', 'PASSWORD_RESET'), allowNull: false },
  codeHash: { type: DataTypes.STRING(128), allowNull: false },
  failedAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  maxAttempts: { type: DataTypes.INTEGER, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  resendAvailableAt: { type: DataTypes.DATE, allowNull: false },
  verifiedAt: { type: DataTypes.DATE, allowNull: true },
  consumedAt: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'email_auth_challenges', indexes: [
  { unique: true, fields: ['email', 'purpose'] },
  { fields: ['expiresAt'] }
] });

module.exports = {
  Organization,
  Tender,
  TenderItem,
  TenderInvitation,
  Offer,
  OfferItem,
  Document,
  Clarification,
  Message,
  PurchaseOrder,
  AuditLog,
  EmailAuthChallenge
};
