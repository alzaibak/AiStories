const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../models');

function stubCollectStatsSources() {
  models.ReadingProgress.findAll = async () => [];
  models.StoryPart.findAll = async () => [];
  models.Story.findAll = async () => [];
  models.QuizAttempt.findAll = async () => [];
  models.TeamMember.count = async () => 1;
  models.EventEntry.findAll = async () => [];
  models.CommunityEvent.findAll = async () => [];
  models.Donation.count = async () => 0;
  models.Subscription.count = async () => 0;
  models.User.findByPk = async (id) => ({ id, language: 'fr' });
  models.BadgeSettings.findOne = async () => ({
    id: 1,
    levels: [{ level: 1, points: 0, names: { fr: 'Explorateur' } }, { level: 2, points: 50, names: { fr: 'Lecteur' } }]
  });
  models.Notification.create = async (payload) => ({ id: 1, ...payload });
}

const badge = {
  id: 1,
  code: 'first-story',
  name: 'أول حكاية',
  description: '...',
  translations: { fr: { name: 'Première histoire', description: '...', howToEarn: '...' } },
  howToEarn: { fr: 'Terminez une histoire.' },
  tier: 'bronze',
  category: 'reading',
  criteria: { type: 'team_joined', threshold: 1 },
  points: 30,
  isActive: true,
  isSecret: false,
  sortOrder: 10
};

test('the award engine awards a badge only once', async () => {
  stubCollectStatsSources();
  models.BadgeType.findAll = async () => [badge];
  models.BadgeAward.findAll = async () => [];
  models.BadgeAward.findOrCreate = async () => ([{ id: 10, badgeTypeId: 1, awardedAt: new Date() }, true]);

  const engine = require('../utils/badges/engine');
  const first = await engine.evaluateUserBadges(5, { trigger: 'test' });
  assert.equal(first.newAwards.length, 1);
  assert.equal(first.pointsGained, 30);
  assert.equal(first.celebration.badge.code, 'first-story');
  assert.equal(first.celebration.message, 'Première histoire');

  // Second run: the award already exists, so nothing is created again.
  models.BadgeAward.findAll = async () => [{ badgeTypeId: 1 }];
  const second = await engine.evaluateUserBadges(5, { trigger: 'test' });
  assert.equal(second.newAwards.length, 0);
  assert.equal(second.pointsGained, 0);
});

test('a badge under its threshold is not awarded', async () => {
  stubCollectStatsSources();
  models.BadgeType.findAll = async () => [{
    ...badge,
    criteria: { type: 'streak_days', threshold: 30 }
  }];
  models.BadgeAward.findAll = async () => [];
  let created = 0;
  models.BadgeAward.findOrCreate = async () => { created += 1; return [{ id: 11 }, true]; };

  const engine = require('../utils/badges/engine');
  const result = await engine.evaluateUserBadges(6);
  assert.equal(result.newAwards.length, 0);
  assert.equal(created, 0);
});

test('manual badges are skipped by the automatic engine', async () => {
  stubCollectStatsSources();
  models.BadgeType.findAll = async () => [{ ...badge, criteria: { type: 'manual' } }];
  models.BadgeAward.findAll = async () => [];
  let created = 0;
  models.BadgeAward.findOrCreate = async () => { created += 1; return [{ id: 12 }, true]; };

  const engine = require('../utils/badges/engine');
  const result = await engine.evaluateUserBadges(7);
  assert.equal(result.newAwards.length, 0);
  assert.equal(created, 0);
});

test('pinning a fourth badge is refused', async () => {
  models.BadgeAward.findOne = async () => ({ badgeTypeId: 3, isFeatured: false, save: async () => {} });
  models.BadgeAward.count = async () => 3;
  const engine = require('../utils/badges/engine');
  await assert.rejects(
    () => engine.toggleFeatured(1, 3),
    (error) => error.status === 409 && error.code === 'FEATURED_LIMIT'
  );
});

test('unlocking a fourth badge is impossible without an award', async () => {
  models.BadgeAward.findOne = async () => null;
  const engine = require('../utils/badges/engine');
  await assert.rejects(() => engine.toggleFeatured(1, 9), (error) => error.status === 403);
});
