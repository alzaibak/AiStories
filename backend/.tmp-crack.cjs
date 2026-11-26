const crypto = require('crypto');
const { EmailAuthChallenge, sequelize } = require('./models');
(async () => {
  const row = await EmailAuthChallenge.findOne({ where: { email: 'qa.superadmin@qa.test', purpose: 'ADMIN_LOGIN', verifiedAt: null, consumedAt: null }, order: [['id', 'DESC']] });
  if (!row) { console.log('no challenge'); await sequelize.close(); return; }
  for (let n = 0; n < 100000000; n++) {
    const code = String(n).padStart(8, '0');
    if (crypto.createHmac('sha256', process.env.OTP_HASH_SECRET).update(code).digest('hex') === row.codeHash) { console.log('CODE', code); break; }
  }
  await sequelize.close();
})();
