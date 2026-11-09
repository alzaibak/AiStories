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
        allowNull: false,
        // REMOVE unique: true
    },
    lastName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        // REMOVE unique: true
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true // keep email unique
    },
    passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('SUPER_ADMIN', 'ADMIN', 'BUYER', 'SELLER'),
        allowNull: false,
        defaultValue: 'BUYER'
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
        defaultValue: 'fr'
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
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
});

module.exports = User;
