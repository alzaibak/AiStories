const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  sellerOrgId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'organizations', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  tradeName: { type: DataTypes.STRING(255), allowNull: false },
  genericName: { type: DataTypes.STRING(255), allowNull: false },
  dosage: { type: DataTypes.STRING(120), allowNull: false },
  dosageForm: { type: DataTypes.STRING(120), allowNull: false },
  packaging: { type: DataTypes.STRING(255), allowNull: true },
  manufacturer: { type: DataTypes.STRING(255), allowNull: true },
  originCountry: { type: DataTypes.STRING(120), allowNull: false },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'categories', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  },
  marketingAuthorization: {
    type: DataTypes.ENUM('APPROVED', 'PENDING', 'NOT_REQUIRED', 'REJECTED'),
    allowNull: true
  },
  therapeuticClasses: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  rcpUrl: { type: DataTypes.STRING(1000), allowNull: true },
  rcpLanguage: { type: DataTypes.ENUM('fr', 'en', 'ar'), allowNull: true },
  rcpUpdatedAt: { type: DataTypes.DATE, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'products',
  timestamps: true,
  paranoid: true,
  indexes: [
    { fields: ['sellerOrgId', 'genericName'] },
    { fields: ['categoryId'] }
  ]
});

module.exports = Product;
