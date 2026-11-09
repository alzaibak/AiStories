const CryptoJS = require('crypto-js');
const { hashPassword } = require('../utils/security');

async function up({ queryInterface, Sequelize }) {
  const columns = await queryInterface.describeTable('users');
  if (columns.password && columns.passwordHash) {
    const legacyUsers = await queryInterface.sequelize.query(
      'SELECT id, password FROM users WHERE passwordHash IS NULL OR passwordHash = ?',
      { replacements: [''], type: Sequelize.QueryTypes.SELECT }
    );

    if (legacyUsers.length && !process.env.SECRET_PASSWORD) {
      throw new Error(
        'SECRET_PASSWORD est requis pour convertir les anciens mots de passe avant de supprimer la colonne users.password.'
      );
    }

    for (const user of legacyUsers) {
      const password = CryptoJS.AES.decrypt(user.password, process.env.SECRET_PASSWORD)
        .toString(CryptoJS.enc.Utf8);
      if (!password) {
        throw new Error(`Impossible de convertir le mot de passe historique de l’utilisateur ${user.id}.`);
      }
      const passwordHash = await hashPassword(password);
      await queryInterface.sequelize.query(
        'UPDATE users SET passwordHash = ? WHERE id = ?',
        { replacements: [passwordHash, user.id] }
      );
    }
  }

  if (columns.passwordHash) {
    const [missingHashes] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS count FROM users WHERE passwordHash IS NULL OR passwordHash = ?',
      { replacements: [''] }
    );
    if (Number(missingHashes[0].count) > 0) {
      throw new Error('La migration est interrompue : certains comptes ne possèdent pas de hash de mot de passe.');
    }
    await queryInterface.changeColumn('users', 'passwordHash', {
      type: Sequelize.STRING(255),
      allowNull: false
    });
  }

  for (const column of ['password', 'subscribe', 'isAdmin']) {
    if (columns[column]) await queryInterface.removeColumn('users', column);
  }
}

async function down() {
  throw new Error('Les champs d’identifiants historiques ne peuvent pas être restaurés sans exposer les mots de passe.');
}

module.exports = { up, down };
