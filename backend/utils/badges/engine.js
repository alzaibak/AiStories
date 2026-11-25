/*
 * Badge award engine. Single server-side entry point used by every feature that
 * can unlock a badge. Never trusts the client, never awards twice.
 */
const { Op } = require('sequelize');
const {
  User,
  BadgeType,
  BadgeAward,
  BadgeSettings,
  Notification,
  ReadingProgress,
  Story,
  StoryPart,
  Collection,
  QuizAttempt,
  TeamMember,
  CommunityEvent,
  EventEntry,
  Subscription,
  Donation,
  Certificate
} = require('../../models');
const {
  evaluateCriteria,
  levelForPoints,
  levelName,
  computeStreak,
  badgeState,
  canFeatureBadge,
  MAX_FEATURED_BADGES,
  DEFAULT_LEVELS,
  TIME_ZONE
} = require('./criteria');

const LANGUAGES = ['ar', 'en', 'fr'];

function normalizeLanguage(value) {
  return LANGUAGES.includes(value) ? value : 'ar';
}

function localized(badge, field, language) {
  const tr = (badge.translations || {})[language] || {};
  if (tr[field]) return tr[field];
  if (field === 'name') return badge.name || '';
  if (field === 'description') return badge.description || '';
  const howToEarn = badge.howToEarn || {};
  return howToEarn[language] || howToEarn.ar || howToEarn.en || howToEarn.fr || '';
}

async function getBadgeSettings() {
  const existing = await BadgeSettings.findOne({ order: [['id', 'ASC']] });
  if (existing) {
    const levels = Array.isArray(existing.levels) && existing.levels.length ? existing.levels : DEFAULT_LEVELS;
    return { settings: existing, levels };
  }
  const created = await BadgeSettings.create({
    levels: DEFAULT_LEVELS,
    certificateSettings: { enabled: true, collections: {} }
  });
  return { settings: created, levels: DEFAULT_LEVELS };
}

/** Every number the criteria need, collected in one pass per reader. */
async function collectStats(userId, { now = new Date() } = {}) {
  const progressRows = await ReadingProgress.findAll({
    where: { userId },
    attributes: ['storyId', 'completedParts', 'lastReadAt']
  });
  const storyIds = [...new Set(progressRows.map((row) => row.storyId).filter(Boolean))];
  const parts = storyIds.length
    ? await StoryPart.findAll({ where: { storyId: { [Op.in]: storyIds } }, attributes: ['id', 'storyId'] })
    : [];
  const partsByStory = new Map();
  for (const part of parts) {
    const list = partsByStory.get(part.storyId) || [];
    list.push(part.id);
    partsByStory.set(part.storyId, list);
  }

  let partsRead = 0;
  let storiesCompleted = 0;
  const completedStoryIds = new Set();
  for (const row of progressRows) {
    const done = Array.isArray(row.completedParts) ? row.completedParts : [];
    partsRead += done.length;
    const storyParts = partsByStory.get(row.storyId) || [];
    if (storyParts.length && storyParts.every((id) => done.includes(id))) {
      storiesCompleted += 1;
      completedStoryIds.add(row.storyId);
    }
  }

  const stories = storyIds.length
    ? await Story.findAll({ where: { id: { [Op.in]: storyIds } }, attributes: ['id', 'collectionId', 'status'] })
    : [];
  const storiesByCollection = new Map();
  for (const story of stories) {
    if (!story.collectionId) continue;
    if (story.status && !['published', 'active'].includes(story.status)) continue;
    const list = storiesByCollection.get(story.collectionId) || [];
    list.push(story);
    storiesByCollection.set(story.collectionId, list);
  }
  const collections = {};
  let collectionsCompleted = 0;
  for (const [collectionId, items] of storiesByCollection) {
    const complete = items.length > 0 && items.every((story) => completedStoryIds.has(story.id));
    collections[String(collectionId)] = complete;
    if (complete) collectionsCompleted += 1;
  }

  const attempts = await QuizAttempt.findAll({
    where: { userId, finishedAt: { [Op.ne]: null } },
    attributes: ['score', 'passed', 'finishedAt', 'completedAt']
  });
  const quizzesCompleted = attempts.filter((attempt) => attempt.passed === true).length;
  const perfectQuizScores = attempts.filter((attempt) => Number(attempt.score) >= 100).length;

  const teamsJoined = await TeamMember.count({ where: { userId } });

  const entries = await EventEntry.findAll({
    where: { userId },
    attributes: ['eventId', 'score', 'createdAt']
  });
  const eventIds = [...new Set(entries.map((entry) => entry.eventId))];
  const events = eventIds.length
    ? await CommunityEvent.findAll({ where: { id: { [Op.in]: eventIds } }, attributes: ['id', 'slug', 'status'] })
    : [];
  const eventById = new Map(events.map((event) => [event.id, event]));
  let bestWeeklyRank = null;
  const eventTags = [];
  for (const entry of entries) {
    const event = eventById.get(entry.eventId);
    if (event?.slug) {
      eventTags.push(event.slug);
      eventTags.push(event.slug.split('-')[0]);
    }
    if (event?.status && !['published', 'completed'].includes(event.status)) continue;
    const better = await EventEntry.count({
      where: { eventId: entry.eventId, score: { [Op.gt]: entry.score } }
    });
    const rank = better + 1;
    if (bestWeeklyRank === null || rank < bestWeeklyRank) bestWeeklyRank = rank;
  }

  const donations = await Donation.count({ where: { userId, status: 'paid' } });
  const activeSubscriptions = await Subscription.count({
    where: { userId, status: { [Op.in]: ['active', 'trialing'] } }
  });

  const activityDates = [
    ...progressRows.map((row) => row.lastReadAt).filter(Boolean),
    ...attempts.map((attempt) => attempt.finishedAt || attempt.completedAt).filter(Boolean)
  ];
  const streak = computeStreak(activityDates, { now, timeZone: TIME_ZONE });

  return {
    partsRead,
    storiesCompleted,
    collections,
    collectionsCompleted,
    quizzesCompleted,
    perfectQuizScores,
    teamsJoined,
    bestWeeklyRank,
    eventTags: [...new Set(eventTags)],
    donations,
    activeSubscriptions,
    currentStreak: streak.current,
    bestStreak: streak.best,
    streakWeek: streak.week,
    quizPoints: attempts.reduce((total, attempt) => total + Math.max(0, Number(attempt.score) || 0), 0),
    completedStoryIds: [...completedStoryIds],
    latestReadAt: progressRows
      .map((row) => row.lastReadAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null
  };
}

function serializeBadge(badge, { language = 'ar', award = null, progress = null, isAdmin = false, earnedCount = null } = {}) {
  const state = badgeState({ badge, award, progress, isAdmin });
  const masked = state.state === 'secret';
  return {
    id: badge.id,
    // Everything below is metadata of the badge itself. For a secret badge that
    // is still locked, all of it is hidden: name, icon, criteria, points, tier,
    // category, event tag, rarity and translations.
    code: masked ? null : badge.code,
    name: masked ? null : localized(badge, 'name', language),
    description: masked ? null : localized(badge, 'description', language),
    howToEarn: masked ? null : localized(badge, 'howToEarn', language),
    translations: masked ? null : badge.translations,
    howToEarnTranslations: masked ? null : badge.howToEarn,
    iconType: masked ? null : badge.iconType,
    iconKey: masked ? null : badge.iconKey || badge.icon,
    imageUrl: masked ? null : badge.imageUrl,
    tier: masked ? null : badge.tier,
    category: masked ? null : badge.category,
    colorTheme: masked ? null : badge.colorTheme || {},
    criteria: masked ? null : badge.criteria || {},
    points: masked ? null : badge.points,
    isSecret: badge.isSecret,
    isActive: badge.isActive,
    sortOrder: badge.sortOrder,
    eventTag: masked ? null : badge.eventTag,
    state: state.state,
    unlocked: state.unlocked,
    progress: {
      currentValue: masked ? 0 : state.currentValue,
      targetValue: masked ? 0 : state.targetValue,
      ratio: masked ? 0 : state.progress
    },
    awardedAt: award?.awardedAt || null,
    isFeatured: Boolean(award?.isFeatured),
    canFeature: canFeatureBadge(0, award),
    earnedCount: masked ? null : earnedCount,
    reason: isAdmin ? award?.reason || null : undefined
  };
}

async function userBadgePayload(userId, { language = 'ar', isAdmin = false } = {}) {
  const { levels } = await getBadgeSettings();
  const [badges, awards, stats] = await Promise.all([
    BadgeType.findAll({ where: isAdmin ? {} : { isActive: true }, order: [['sortOrder', 'ASC'], ['id', 'ASC']] }),
    BadgeAward.findAll({ where: { userId } }),
    collectStats(userId)
  ]);
  const awardByBadge = new Map(awards.map((award) => [award.badgeTypeId, award]));
  const earnedCounts = await BadgeAward.findAll({
    attributes: ['badgeTypeId', [BadgeAward.sequelize.fn('COUNT', BadgeAward.sequelize.col('id')), 'total']],
    group: ['badgeTypeId'],
    raw: true
  });
  const counts = new Map(earnedCounts.map((row) => [row.badgeTypeId, Number(row.total)]));

  const items = badges.map((badge) => serializeBadge(badge, {
    language,
    award: awardByBadge.get(badge.id) || null,
    progress: evaluateCriteria(badge.criteria, stats),
    isAdmin,
    earnedCount: counts.get(badge.id) || 0
  }));
  const totalPoints = items
    .filter((item) => item.unlocked)
    .reduce((total, item) => total + (Number(item.points) || 0), 0);
  const level = levelForPoints(totalPoints, levels);
  return {
    badges: items,
    stats,
    levels,
    level: { ...level, name: levelName(level, language) },
    totalPoints,
    earnedCount: items.filter((item) => item.unlocked).length,
    totalCount: isAdmin ? items.length : items.filter((item) => item.isActive).length,
    featuredLimit: MAX_FEATURED_BADGES
  };
}

async function notifyAward(user, badge, award, language) {
  const name = localized(badge, 'name', language);
  const body = localized(badge, 'howToEarn', language);
  try {
    return await Notification.create({
      userId: user.id,
      type: 'badge_awarded',
      title: name,
      body,
      data: { badgeId: badge.id, badgeCode: badge.code, awardId: award.id }
    });
  } catch (error) {
    return null;
  }
}

/**
 * Evaluate every active badge for one reader and award the ones now unlocked.
 * Idempotent: an existing award always wins, even under a race.
 */
async function evaluateUserBadges(userId, { trigger = 'event', now = new Date() } = {}) {
  const user = await User.findByPk(userId, { attributes: ['id', 'language'] });
  if (!user) return { newAwards: [], pointsGained: 0, totalPoints: 0 };
  const language = normalizeLanguage(user.language);
  const { levels } = await getBadgeSettings();
  const [badges, existing, stats] = await Promise.all([
    BadgeType.findAll({ where: { isActive: true }, order: [['sortOrder', 'ASC']] }),
    BadgeAward.findAll({ where: { userId }, attributes: ['badgeTypeId'] }),
    collectStats(userId, { now })
  ]);
  const owned = new Set(existing.map((award) => award.badgeTypeId));
  const newAwards = [];

  for (const badge of badges) {
    if (owned.has(badge.id)) continue;
    const criteria = badge.criteria || {};
    if (criteria.type === 'manual' || !criteria.type) continue;
    const progress = evaluateCriteria(criteria, stats);
    if (!progress.unlocked) continue;
    try {
      const [award, created] = await BadgeAward.findOrCreate({
        where: { userId, badgeTypeId: badge.id, sourceType: 'criteria', sourceId: null },
        defaults: {
          userId,
          badgeTypeId: badge.id,
          sourceType: 'criteria',
          sourceId: null,
          metadata: { trigger },
          progressSnapshot: progress,
          awardedAt: new Date()
        }
      });
      if (!created) continue;
      await notifyAward(user, badge, award, language);
      newAwards.push(serializeBadge(badge, { language, award, progress }));
    } catch (error) {
      // Unique race: another request already awarded it.
      continue;
    }
  }

  const awardedPoints = await BadgeAward.findAll({ where: { userId }, attributes: ['badgeTypeId'] });
  const pointByBadge = new Map(badges.map((badge) => [badge.id, Number(badge.points) || 0]));
  const totalPoints = awardedPoints.reduce((total, award) => total + (pointByBadge.get(award.badgeTypeId) || 0), 0);
  const level = levelForPoints(totalPoints, levels);
  const latest = newAwards[newAwards.length - 1] || null;
  return {
    newAwards,
    pointsGained: newAwards.reduce((total, item) => total + (Number(item.points) || 0), 0),
    totalPoints,
    level: { ...level, name: levelName(level, language) },
    celebration: latest ? { badge: latest, message: latest.name } : null
  };
}

async function awardManual({ userId, badgeId, adminId, reason, now = new Date() }) {
  const badge = await BadgeType.findByPk(badgeId);
  if (!badge) {
    const error = new Error('Badge introuvable.');
    error.status = 404;
    throw error;
  }
  const user = await User.findByPk(userId, { attributes: ['id', 'language'] });
  if (!user) {
    const error = new Error('Utilisateur introuvable.');
    error.status = 404;
    throw error;
  }
  const [award, created] = await BadgeAward.findOrCreate({
    where: { userId, badgeTypeId: badge.id, sourceType: 'manual', sourceId: null },
    defaults: {
      userId,
      badgeTypeId: badge.id,
      sourceType: 'manual',
      sourceId: null,
      reason: reason || null,
      awardedBy: adminId || null,
      metadata: { trigger: 'admin' },
      progressSnapshot: { type: 'manual', currentValue: 1, targetValue: 1, unlocked: true, progress: 1 },
      awardedAt: now
    }
  });
  if (created) await notifyAward(user, badge, award, normalizeLanguage(user.language));
  return { award, created };
}

async function revokeAward({ userId, badgeId, adminId, reason }) {
  const award = await BadgeAward.findOne({ where: { userId, badgeTypeId: badgeId } });
  if (!award) {
    const error = new Error('Attribution introuvable.');
    error.status = 404;
    throw error;
  }
  await award.destroy();
  try {
    await Notification.create({
      userId,
      type: 'badge_revoked',
      title: 'Badge retiré',
      body: reason || null,
      data: { badgeId, revokedBy: adminId || null }
    });
  } catch (error) {
    // Notification is best effort.
  }
  return { removed: true };
}

async function toggleFeatured(userId, badgeId) {
  const award = await BadgeAward.findOne({ where: { userId, badgeTypeId: badgeId } });
  if (!award) {
    const error = new Error('Ce badge n’est pas encore débloqué.');
    error.status = 403;
    throw error;
  }
  if (!award.isFeatured) {
    const featured = await BadgeAward.count({ where: { userId, isFeatured: true } });
    if (featured >= MAX_FEATURED_BADGES) {
      const error = new Error(`Vous pouvez épingler ${MAX_FEATURED_BADGES} badges au maximum.`);
      error.status = 409;
      error.code = 'FEATURED_LIMIT';
      throw error;
    }
  }
  award.isFeatured = !award.isFeatured;
  await award.save();
  return { badgeId: award.badgeTypeId, isFeatured: award.isFeatured };
}

async function profileSummary(userId, { language = 'ar', now = new Date() } = {}) {
  const user = await User.findByPk(userId);
  if (!user) {
    const error = new Error('Utilisateur introuvable.');
    error.status = 404;
    throw error;
  }
  const payload = await userBadgePayload(userId, { language });
  const stats = payload.stats;

  const progressRows = await ReadingProgress.findAll({
    where: { userId },
    order: [['lastReadAt', 'DESC']]
  });
  let continueReading = null;
  const latest = progressRows.find((row) => row.lastReadAt);
  if (latest) {
    const story = await Story.findByPk(latest.storyId);
    if (story) {
      const parts = await StoryPart.findAll({
        where: { storyId: story.id },
        attributes: ['id', 'partNumber', 'title'],
        order: [['partNumber', 'ASC']]
      }).catch(() => []);
      const done = Array.isArray(latest.completedParts) ? latest.completedParts : [];
      const nextPart = parts.find((part) => !done.includes(part.id)) || parts[parts.length - 1] || null;
      continueReading = {
        storyId: story.id,
        slug: story.slug,
        title: story.title,
        coverImageUrl: story.coverImageUrl || story.coverImage || null,
        completedParts: done.length,
        totalParts: parts.length,
        progressPercent: parts.length ? Math.round((done.length / parts.length) * 100) : 0,
        nextPartNumber: nextPart?.partNumber || 1,
        nextPartTitle: nextPart?.title || null,
        lastReadAt: latest.lastReadAt
      };
    }
  }

  const featured = payload.badges.filter((badge) => badge.isFeatured).slice(0, MAX_FEATURED_BADGES);
  const nextBadges = payload.badges
    .filter((badge) => !badge.unlocked && badge.state !== 'secret' && badge.progress.targetValue > 0)
    .sort((a, b) => b.progress.ratio - a.progress.ratio)
    .slice(0, 3);

  const awards = await BadgeAward.findAll({
    where: { userId },
    order: [['awardedAt', 'DESC']],
    limit: 8
  });
  const badgesById = new Map(payload.badges.map((badge) => [badge.id, badge]));
  const recentAchievements = awards
    .map((award) => {
      const badge = badgesById.get(award.badgeTypeId);
      if (!badge) return null;
      return {
        type: 'badge',
        at: award.awardedAt,
        title: badge.name,
        iconKey: badge.iconKey || 'award',
        imageUrl: badge.imageUrl,
        tier: badge.tier,
        badgeId: award.badgeTypeId
      };
    })
    .filter(Boolean);

  const subscription = await Subscription.findOne({
    where: { userId, status: { [Op.in]: ['active', 'trialing', 'past_due'] } },
    order: [['id', 'DESC']],
    include: [{ association: 'plan', required: false }]
  }).catch(() => null);
  const certificatesEarned = await Certificate.count({ where: { userId } });

  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      language: user.language,
      avatarUrl: user.avatarUrl || null,
      createdAt: user.createdAt,
      points: payload.totalPoints
    },
    plan: subscription
      ? {
        name: subscription.plan?.name || 'Premium',
        status: subscription.status,
        expiresAt: subscription.expiresAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
      }
      : { name: 'Free', status: 'free', expiresAt: null, cancelAtPeriodEnd: false },
    level: payload.level,
    stats: {
      storiesCompleted: stats.storiesCompleted,
      quizPoints: stats.quizPoints,
      currentStreak: stats.currentStreak,
      badgesEarned: payload.earnedCount,
      badgesTotal: payload.totalCount,
      partsRead: stats.partsRead,
      quizzesCompleted: stats.quizzesCompleted,
      certificates: certificatesEarned
    },
    streak: { current: stats.currentStreak, best: stats.bestStreak, week: stats.streakWeek },
    continueReading,
    featuredBadges: featured,
    nextBadges,
    recentAchievements,
    certificates: { earned: certificatesEarned, inProgress: 0 },
    badges: payload.badges
  };
}

module.exports = {
  getBadgeSettings,
  collectStats,
  serializeBadge,
  userBadgePayload,
  evaluateUserBadges,
  awardManual,
  revokeAward,
  toggleFeatured,
  profileSummary,
  localized,
  normalizeLanguage
};
