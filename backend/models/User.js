const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    firstName: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    lastName: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    stripeCustomerId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true
    },
    passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'REVIEWER', 'READER', 'BUYER', 'SELLER'),
        allowNull: false,
        defaultValue: 'READER'
    },
    organizationId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'SET NULL'
    },
    language: {
        type: DataTypes.ENUM('fr', 'en', 'ar'),
        allowNull: false,
        defaultValue: 'ar'
    },
    emailPreferences: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: { marketing: true, reminders: true }
    },
    status: {
        type: DataTypes.ENUM('ACTIVE', 'PENDING', 'SUSPENDED'),
        allowNull: false,
        defaultValue: 'ACTIVE'
    },
    twoFactorEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    mustChangePassword: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    tokenVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    adminLoginFailedAttempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    adminLockedUntil: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
});

module.exports = User;
