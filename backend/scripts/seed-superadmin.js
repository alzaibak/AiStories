const fs = require('node:fs');
const path = require('node:path');
require('../config/environment').loadEnvironment();
const sequelize = require('../config/database');
const { AuditLog, User } = require('../models');
const { hashPrivilegedPassword } = require('../utils/security');
const runMigrations = require('../migrate');

function assertStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 200 ||
    !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('SUPERADMIN_INITIAL_PASSWORD must be at least 14 characters and include lower/uppercase, a number, and a symbol.');
  }
}

async function removeInitialPasswordFromEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  const cleaned = content.replace(/^[ \t]*SUPERADMIN_INITIAL_PASSWORD[ \t]*=.*(?:\r?\n|$)/gm, '');
  if (cleaned !== content) fs.writeFileSync(envPath, cleaned, 'utf8');
}

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_INITIAL_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set a valid SUPERADMIN_EMAIL in backend/.env.');
  }
  assertStrongPassword(password);
  if (password === process.env.JWT_SECRET_KEY || password === process.env.OTP_HASH_SECRET) {
    throw new Error('The initial password must differ from JWT_SECRET_KEY and OTP_HASH_SECRET.');
  }

  await sequelize.authenticate();
  await runMigrations('up');
  const existing = await User.findOne({ where: { email } });
  if (existing) throw new Error('An account already uses SUPERADMIN_EMAIL. No account was changed.');

  const transaction = await sequelize.transaction();
  let superadmin;
  try {
    superadmin = await User.create({
      firstName: 'Super',
      lastName: 'Administrator',
      email,
      passwordHash: await hashPrivilegedPassword(password),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      language: 'ar',
      emailVerifiedAt: new Date(),
      mustChangePassword: true
    }, { transaction });
    await AuditLog.create({
      userId: superadmin.id,
      action: 'SUPERADMIN_BOOTSTRAPPED',
      entityType: 'User',
      entityId: String(superadmin.id),
      metadata: { method: 'server_cli' }
    }, { transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
  await removeInitialPasswordFromEnv();
  delete process.env.SUPERADMIN_INITIAL_PASSWORD;
  console.info(`Superadmin account created for ${email}; change the initial password after the first sign-in.`);
}

main()
  .catch((error) => {
    console.error('Superadmin bootstrap failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
