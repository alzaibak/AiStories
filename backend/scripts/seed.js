const sequelize = require('../config/database');
const { User } = require('../models');
const { hashPassword } = require('../utils/security');
const { ensureSeedAdmin } = require('../utils/seedAdmin');
const { seedStories } = require('./seedStories');

async function main() {
  const adminOnly = process.argv.includes('--admin-only');
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Définissez SEED_ADMIN_PASSWORD avec au moins 12 caractères.');
  }
  if (!process.env.SEED_ADMIN_EMAIL) {
    throw new Error('Définissez SEED_ADMIN_EMAIL avant de créer le compte administrateur.');
  }

  await sequelize.authenticate();
  if (!adminOnly) await require('../migrate')('up');

  const { renamed, removedPrevious } = await ensureSeedAdmin({
    User,
    hashPassword,
    email: process.env.SEED_ADMIN_EMAIL,
    password,
    previousEmail: process.env.SEED_ADMIN_PREVIOUS_EMAIL,
    deletePreviousAdmin: process.env.SEED_ADMIN_DELETE_PREVIOUS === 'true'
  });
  console.info(renamed
    ? `Compte SUPER_ADMIN transféré vers ${process.env.SEED_ADMIN_EMAIL.toLowerCase()}.`
    : `Compte SUPER_ADMIN prêt : ${process.env.SEED_ADMIN_EMAIL.toLowerCase()}.`);
  if (removedPrevious) console.info('Ancien compte super-administrateur supprimé.');

  if (!adminOnly) {
    await seedStories();
    console.info('Données de démonstration des histoires créées.');
  }
}

main()
  .catch((error) => {
    console.error('Échec de la création des graines :', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
