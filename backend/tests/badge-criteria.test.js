const test = require('node:test');
const assert = require('node:assert/strict');
const criteria = require('../utils/badges/criteria');

test('numeric criteria compute progress and unlock', () => {
  const result = criteria.evaluateCriteria({ type: 'stories_completed', threshold: 5 }, { storiesCompleted: 3 });
  assert.equal(result.currentValue, 3);
  assert.equal(result.targetValue, 5);
  assert.equal(result.unlocked, false);
  assert.equal(result.progress, 0.6);
  const done = criteria.evaluateCriteria({ type: 'stories_completed', threshold: 5 }, { storiesCompleted: 8 });
  assert.equal(done.unlocked, true);
  assert.equal(done.progress, 1);
});

test('every supported criteria type evaluates', () => {
  const stats = {
    storiesCompleted: 2,
    partsRead: 12,
    currentStreak: 4,
    quizzesCompleted: 3,
    perfectQuizScores: 1,
    collections: { '7': true },
    collectionsCompleted: 1,
    bestWeeklyRank: 6,
    teamsJoined: 1,
    donations: 1,
    activeSubscriptions: 0,
    eventTags: ['ramadan-2026', 'ramadan']
  };
  assert.equal(criteria.evaluateCriteria({ type: 'parts_read', threshold: 10 }, stats).unlocked, true);
  assert.equal(criteria.evaluateCriteria({ type: 'streak_days', threshold: 7 }, stats).unlocked, false);
  assert.equal(criteria.evaluateCriteria({ type: 'quizzes_completed', threshold: 3 }, stats).unlocked, true);
  assert.equal(criteria.evaluateCriteria({ type: 'perfect_quiz_scores', threshold: 1 }, stats).unlocked, true);
  assert.equal(criteria.evaluateCriteria({ type: 'collection_completed', collectionId: 7 }, stats).unlocked, true);
  assert.equal(criteria.evaluateCriteria({ type: 'collection_completed', collectionId: 9 }, stats).unlocked, false);
  assert.equal(criteria.evaluateCriteria({ type: 'weekly_challenge_rank', threshold: 10 }, stats).unlocked, true);
  assert.equal(criteria.evaluateCriteria({ type: 'weekly_challenge_rank', threshold: 3 }, stats).unlocked, false);
  assert.equal(criteria.evaluateCriteria({ type: 'team_joined' }, stats).unlocked, true);
  assert.equal(criteria.evaluateCriteria({ type: 'early_supporter' }, stats).unlocked, true);
  assert.equal(criteria.evaluateCriteria({ type: 'event_participation', eventTag: 'ramadan' }, stats).unlocked, true);
  assert.equal(criteria.evaluateCriteria({ type: 'event_participation', eventTag: 'hajj' }, stats).unlocked, false);
});

test('manual badges are never auto awarded', () => {
  const result = criteria.evaluateCriteria({ type: 'manual' }, { storiesCompleted: 99 });
  assert.equal(result.manual, true);
  assert.equal(result.unlocked, false);
});

test('unknown criteria stay locked instead of throwing', () => {
  const result = criteria.evaluateCriteria({ type: 'something_new', threshold: 1 }, {});
  assert.equal(result.unlocked, false);
  assert.equal(result.targetValue, 0);
});

test('levels follow the points palette', () => {
  assert.equal(criteria.levelForPoints(0).level, 1);
  assert.equal(criteria.levelForPoints(49).level, 1);
  assert.equal(criteria.levelForPoints(50).level, 2);
  const level = criteria.levelForPoints(220);
  assert.equal(level.level, 3);
  assert.equal(level.nextLevel.level, 4);
  assert.equal(level.pointsToNext, 80);
  assert.equal(level.progressPercent, 47);
  assert.equal(criteria.levelName(level, 'fr'), 'Compagnon des récits');
  const capped = criteria.levelForPoints(99999);
  assert.equal(capped.level, 6);
  assert.equal(capped.progressPercent, 100);
  assert.equal(capped.nextLevel, null);
});

test('custom levels are honoured', () => {
  const levels = [
    { level: 1, points: 0, names: { ar: 'أ', en: 'A', fr: 'A' } },
    { level: 2, points: 10, names: { ar: 'ب', en: 'B', fr: 'B' } }
  ];
  assert.equal(criteria.levelForPoints(12, levels).level, 2);
  assert.equal(criteria.levelForPoints(5, levels).pointsToNext, 5);
});

test('streak is computed in the Europe/Paris timezone', () => {
  const dates = ['2026-01-02T23:30:00.000Z', '2026-01-02T10:00:00.000Z'];
  const result = criteria.computeStreak(dates, { now: new Date('2026-01-03T08:00:00.000Z') });
  // 23:30 UTC on the 2nd is already the 3rd in Paris.
  assert.equal(result.current, 2);
  assert.equal(result.best, 2);
  assert.equal(result.week.length, 7);
  assert.equal(result.week[6].status, 'today');
});

test('a missed day resets the current streak but keeps the best', () => {
  const dates = ['2026-02-01T10:00:00.000Z', '2026-02-02T10:00:00.000Z', '2026-02-03T10:00:00.000Z', '2026-02-05T10:00:00.000Z'];
  const result = criteria.computeStreak(dates, { now: new Date('2026-02-05T20:00:00.000Z') });
  assert.equal(result.current, 1);
  assert.equal(result.best, 3);
});

test('streak counts yesterday when today has no activity yet', () => {
  const dates = ['2026-03-09T10:00:00.000Z', '2026-03-10T10:00:00.000Z'];
  const result = criteria.computeStreak(dates, { now: new Date('2026-03-11T06:00:00.000Z') });
  assert.equal(result.current, 2);
  assert.equal(result.week[6].status, 'today_pending');
});

test('secret badges are masked until unlocked', () => {
  const secret = { isSecret: true };
  const locked = criteria.badgeState({ badge: secret, award: null, progress: { progress: 0.4, currentValue: 2, targetValue: 5 } });
  assert.equal(locked.state, 'secret');
  assert.equal(locked.hidden, true);
  assert.equal(locked.name, null);
  const unlocked = criteria.badgeState({ badge: secret, award: { id: 1 }, progress: { progress: 1, currentValue: 5, targetValue: 5 } });
  assert.equal(unlocked.state, 'unlocked');
  assert.equal(unlocked.hidden, false);
  const admin = criteria.badgeState({ badge: secret, award: null, progress: {}, isAdmin: true });
  assert.equal(admin.state, 'locked');
});

test('badge state separates locked, in progress and unlocked', () => {
  const badge = { isSecret: false };
  assert.equal(criteria.badgeState({ badge, award: null, progress: { progress: 0 } }).state, 'locked');
  assert.equal(criteria.badgeState({ badge, award: null, progress: { progress: 0.3 } }).state, 'in_progress');
  assert.equal(criteria.badgeState({ badge, award: { id: 2 }, progress: { progress: 1 } }).state, 'unlocked');
});

test('only three badges can be pinned', () => {
  const award = { isFeatured: false };
  assert.equal(criteria.canFeatureBadge(0, award), true);
  assert.equal(criteria.canFeatureBadge(2, award), true);
  assert.equal(criteria.canFeatureBadge(3, award), false);
  assert.equal(criteria.canFeatureBadge(3, { isFeatured: true }), true);
  assert.equal(criteria.canFeatureBadge(0, null), false);
});
