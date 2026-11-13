require('../config/environment').loadEnvironment();
const sequelize = require('../config/database');
const { AuditLog, User } = require('../models');
const { hashPrivilegedPassword } = require('../utils/security');

function assertStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 200 ||
    !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('SUPERADMIN_RECOVERY_PASSWORD must be at least 14 characters and include lower/uppercase, a number, and a symbol.');
  }
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('This recovery command may only be run on the production server.');
  }
  const password = process.env.SUPERADMIN_RECOVERY_PASSWORD;
  assertStrongPassword(password);
  if (password === process.env.JWT_SECRET_KEY || password === process.env.OTP_HASH_SECRET) {
    throw new Error('The recovery password must differ from JWT_SECRET_KEY and OTP_HASH_SECRET.');
  }

  await sequelize.authenticate();
  const superadmin = await User.findOne({ where: { role: 'SUPER_ADMIN' } });
  if (!superadmin) throw new Error('No SUPER_ADMIN account exists.');
  superadmin.passwordHash = await hashPrivilegedPassword(password);
  superadmin.mustChangePassword = true;
  superadmin.tokenVersion = (superadmin.tokenVersion || 0) + 1;
  superadmin.adminLoginFailedAttempts = 0;
  superadmin.adminLockedUntil = null;
  await superadmin.save();
  await AuditLog.create({
    userId: superadmin.id,
    action: 'SUPERADMIN_RECOVERED',
    entityType: 'User',
    entityId: String(superadmin.id),
    metadata: { method: 'server_cli' }
  });
  console.info('Superadmin password reset; all existing sessions have been invalidated.');
}

main()
  .catch((error) => {
    console.error('Superadmin recovery failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.SUPERADMIN_RECOVERY_PASSWORD;
    await sequelize.close();
  });
