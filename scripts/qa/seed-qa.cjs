// QA fixtures. Creates dedicated @qa.test accounts for every role/status plus a
// plan and a donation campaign, so no real account or real mailbox is involved.
// Idempotent: safe to re-run. Writes scripts/qa/qa-data.json for the Playwright specs.
const fs = require('node:fs');
const path = require('node:path');
const sequelize = require('../../backend/config/database');
const models = require('../../backend/models');
const { hashPassword } = require('../../backend/utils/security');

const QA_PASSWORD = 'QaPass!2026x';
const accounts = [
  { key: 'reader', email: 'qa.reader@qa.test', role: 'READER', status: 'ACTIVE', verified: true, firstName: 'Qa', lastName: 'Lecteur' },
  { key: 'unverified', email: 'qa.unverified@qa.test', role: 'READER', status: 'ACTIVE', verified: false, firstName: 'Qa', lastName: 'NonVerifie' },
  { key: 'pending', email: 'qa.pending@qa.test', role: 'READER', status: 'PENDING', verified: false, firstName: 'Qa', lastName: 'EnAttente' },
  { key: 'suspended', email: 'qa.suspended@qa.test', role: 'READER', status: 'SUSPENDED', verified: true, firstName: 'Qa', lastName: 'Suspendu' },
  { key: 'editor', email: 'qa.editor@qa.test', role: 'EDITOR', status: 'ACTIVE', verified: true, firstName: 'Qa', lastName: 'Editeur' },
  { key: 'reviewer', email: 'qa.reviewer@qa.test', role: 'REVIEWER', status: 'ACTIVE', verified: true, firstName: 'Qa', lastName: 'Relecteur' },
  { key: 'admin', email: 'qa.admin@qa.test', role: 'ADMIN', status: 'ACTIVE', verified: true, firstName: 'Qa', lastName: 'Admin' },
  { key: 'superadmin', email: 'qa.superadmin@qa.test', role: 'SUPER_ADMIN', status: 'ACTIVE', verified: true, firstName: 'Qa', lastName: 'SuperAdmin' }
];

async function main() {
  await sequelize.authenticate();
  const passwordHash = await hashPassword(QA_PASSWORD);
  const created = {};
  for (const account of accounts) {
    const values = {
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
      passwordHash,
      role: account.role,
      status: account.status,
      language: 'ar',
      emailVerifiedAt: account.verified ? new Date() : null,
      mustChangePassword: false,
      tokenVersion: 0
    };
    const existing = await models.User.findOne({ where: { email: account.email } });
    if (existing) {
      await existing.update(values);
      created[account.key] = existing.id;
    } else {
      const user = await models.User.create(values);
      created[account.key] = user.id;
    }
    console.log(`[seed-qa] ${account.email} role=${account.role} status=${account.status} verified=${account.verified}`);
  }

  const [plan] = await models.Plan.findOrCreate({
    where: { slug: 'qa-mensuel' },
    defaults: {
      name: 'Abonnement QA',
      price: '9.90',
      currency: 'EUR',
      interval: 'month',
      features: ['Accès illimité', 'Sans publicité'],
      translations: {
        ar: { name: 'اشتراك تجريبي', features: ['وصول كامل', 'بدون إعلانات'] },
        en: { name: 'QA subscription', features: ['Unlimited access', 'No ads'] },
        fr: { name: 'Abonnement QA', features: ['Accès illimité', 'Sans publicité'] }
      },
      isActive: true
    }
  });
  await plan.update({ isActive: true });
  console.log(`[seed-qa] plan ${plan.slug} id=${plan.id}`);

  const [campaign] = await models.DonationCampaign.findOrCreate({
    where: { slug: 'qa-campagne' },
    defaults: {
      goalAmount: '5000.00',
      currency: 'EUR',
      status: 'active',
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 30 * 86400000),
      translations: {
        ar: { title: 'حملة تجريبية', description: 'حملة اختبار للتبرعات.' },
        en: { title: 'QA campaign', description: 'Test campaign for donations.' },
        fr: { title: 'Campagne QA', description: 'Campagne de test pour les dons.' }
      }
    }
  });
  await campaign.update({ status: 'active' });
  console.log(`[seed-qa] campaign ${campaign.slug} id=${campaign.id}`);

  const stories = await models.Story.findAll({ attributes: ['id', 'slug', 'status', 'isFree'] });
  const collections = await models.Collection.findAll({ attributes: ['id', 'slug', 'title'] });
  const books = await models.Book.findAll({ attributes: ['id', 'slug', 'title', 'status', 'format', 'price'] });
  const boxes = await models.MysteryBox.findAll({ attributes: ['id', 'slug', 'status', 'price'] });

  const data = {
    password: QA_PASSWORD,
    accounts: created,
    emails: Object.fromEntries(accounts.map((a) => [a.key, a.email])),
    planSlug: plan.slug,
    campaignSlug: campaign.slug,
    stories: stories.map((s) => s.toJSON()),
    collections: collections.map((c) => c.toJSON()),
    books: books.map((b) => b.toJSON()),
    boxes: boxes.map((b) => b.toJSON())
  };
  fs.writeFileSync(path.join(__dirname, 'qa-data.json'), JSON.stringify(data, null, 2));
  console.log('[seed-qa] wrote qa-data.json');
}

main()
  .catch((error) => {
    console.error('[seed-qa] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
