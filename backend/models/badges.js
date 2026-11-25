const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const id = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };
const timestamps = { timestamps: true };

const Notification = sequelize.define('Notification', {
  id,
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  },
  type: { type: DataTypes.STRING(60), allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: true },
  data: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  readAt: { type: DataTypes.DATE, allowNull: true }
}, { ...timestamps, tableName: 'notifications', indexes: [{ fields: ['userId', 'readAt'] }] });

const BadgeSettings = sequelize.define('BadgeSettings', {
  id,
  levels: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  certificateSettings: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  updatedBy: { type: DataTypes.INTEGER, allowNull: true }
}, { ...timestamps, tableName: 'badge_settings' });

const User = sequelize.models.User;
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = { Notification, BadgeSettings };
