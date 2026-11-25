const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../models');

function stubStats() {
  models.ReadingProgress.findAll = async () => [];
  models.StoryPart.findAll = async () => [];
  models.Story.findAll = async () => [];
  models.QuizAttempt.findAll = async () => [];
  models.TeamMember.count = async () => 0;
  models.EventEntry.findAll = async () => [];
  models.CommunityEvent.findAll = async () => [];
  models.Donation.count = async () => 0;
  models.Subscription.count = async () => 0;
  models.BadgeSettings.findOne = async () => ({ id: 1, levels: [{ level: 1, points: 0, names: { fr: 'Explorateur' } }] });
}

const secretBadge = {
  id: 42,
  code: 'early-supporter',
  name: 'داعم مبكر',
  description: 'Vous avez soutenu le projet dès ses débuts.',
  translations: {
    ar: { name: 'داعم مبكر', description: '...', howToEarn: '...' },
    fr: { name: 'Défenseur des débuts', description: '...', howToEarn: 'Abonnez-vous ou faites un don.' }
  },
  howToEarn: { ar: '...', fr: 'Abonnez-vous ou faites un don.' },
  iconType: 'library',
  iconKey: 'heart',
  imageUrl: 'https://cdn.example.test/secret-heart.png',
  tier: 'special',
  category: 'supporter',
  colorTheme: { preset: 'rose' },
  criteria: { type: 'stories_completed', threshold: 30 },
  points: 80,
  isSecret: true,
  isActive: true,
  sortOrder: 120,
  eventTag: 'ramadan'
};

const publicBadge = {
  id: 7,
  code: 'team-player',
  name: 'روح الفريق',
  description: '...',
  translations: { fr: { name: 'Esprit d’équipe', description: '...', howToEarn: '...' } },
  howToEarn: { fr: 'Rejoignez une équipe.' },
  iconType: 'library',
  iconKey: 'users',
  imageUrl: null,
  tier: 'bronze',
  category: 'community',
  colorTheme: {},
  criteria: { type: 'team_joined', threshold: 1 },
  points: 25,
  isSecret: false,
  isActive: true,
  sortOrder: 110,
  eventTag: null
};

test('a locked secret badge leaks nothing to the reader API', async () => {
  stubStats();
  models.BadgeType.findAll = async () => [publicBadge, secretBadge];
  models.BadgeAward.findAll = async () => [];
  const engine = require('../utils/badges/engine');

  const payload = await engine.userBadgePayload(3, { language: 'fr' });
  const secret = payload.badges.find((badge) => badge.id === secretBadge.id);

  assert.equal(secret.state, 'secret');
  assert.equal(secret.name, null);
  assert.equal(secret.description, null);
  assert.equal(secret.howToEarn, null);
  assert.equal(secret.code, null);
  assert.equal(secret.iconKey, null);
  assert.equal(secret.imageUrl, null);
  assert.equal(secret.tier, null);
  assert.equal(secret.category, null);
  assert.equal(secret.colorTheme, null);
  assert.equal(secret.criteria, null);
  assert.equal(secret.points, null);
  assert.equal(secret.eventTag, null);
  assert.equal(secret.translations, null);
  assert.equal(secret.howToEarnTranslations, null);
  assert.equal(secret.earnedCount, null);
  assert.equal(secret.progress.currentValue, 0);
  assert.equal(secret.progress.targetValue, 0);
  assert.equal(secret.progress.ratio, 0);

  const serialized = JSON.stringify(secret);
  for (const leak of ['stories_completed', 'ramadan', 'heart', 'early-supporter', 'داعم مبكر', 'Défenseur']) {
    assert.equal(serialized.includes(leak), false, `secret badge leaked "${leak}"`);
  }
});

test('a public locked badge still shows its criteria and points', async () => {
  stubStats();
  models.BadgeType.findAll = async () => [publicBadge, secretBadge];
  models.BadgeAward.findAll = async () => [];
  const engine = require('../utils/badges/engine');

  const payload = await engine.userBadgePayload(3, { language: 'fr' });
  const open = payload.badges.find((badge) => badge.id === publicBadge.id);
  assert.equal(open.name, 'Esprit d’équipe');
  assert.deepEqual(open.criteria, { type: 'team_joined', threshold: 1 });
  assert.equal(open.points, 25);
});

test('an unlocked secret badge is revealed', async () => {
  stubStats();
  models.BadgeType.findAll = async () => [secretBadge];
  models.BadgeAward.findAll = async () => [{ badgeTypeId: secretBadge.id, awardedAt: new Date(), isFeatured: false }];
  const engine = require('../utils/badges/engine');

  const payload = await engine.userBadgePayload(3, { language: 'fr' });
  const unlocked = payload.badges[0];
  assert.equal(unlocked.state, 'unlocked');
  assert.equal(unlocked.name, 'Défenseur des débuts');
  assert.deepEqual(unlocked.criteria, { type: 'stories_completed', threshold: 30 });
  assert.equal(unlocked.points, 80);
});

test('quota maths for e-book downloads', () => {
  const { quotaState } = require('../utils/bookDownloads');
  assert.deepEqual(quotaState(5, 0), { unlimited: false, allowed: true, used: 0, remaining: 5 });
  assert.deepEqual(quotaState(5, 4), { unlimited: false, allowed: true, used: 4, remaining: 1 });
  assert.deepEqual(quotaState(5, 5), { unlimited: false, allowed: false, used: 5, remaining: 0 });
  assert.deepEqual(quotaState(5, 9), { unlimited: false, allowed: false, used: 9, remaining: 0 });
  assert.deepEqual(quotaState(null, 12), { unlimited: true, allowed: true, used: 12, remaining: null });
});
