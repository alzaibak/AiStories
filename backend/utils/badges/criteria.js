/*
 * Pure badge rules: criteria evaluation, levels, streaks and display states.
 * No database access, so every rule is unit-testable in isolation.
 */

const CRITERIA_TYPES = [
  'stories_completed', 'parts_read', 'streak_days', 'quizzes_completed', 'perfect_quiz_scores',
  'collection_completed', 'weekly_challenge_rank', 'team_joined', 'early_supporter',
  'event_participation', 'manual'
];

const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'special'];
const CATEGORIES = ['reading', 'quiz', 'streak', 'collection', 'competition', 'community', 'supporter', 'event'];
const MAX_FEATURED_BADGES = 3;

const DEFAULT_LEVELS = [
  { level: 1, points: 0, names: { ar: 'مستكشف', en: 'Explorer', fr: 'Explorateur' } },
  { level: 2, points: 50, names: { ar: 'قارئ', en: 'Reader', fr: 'Lecteur' } },
  { level: 3, points: 150, names: { ar: 'رفيق الحكايات', en: 'Story companion', fr: 'Compagnon des récits' } },
  { level: 4, points: 300, names: { ar: 'طالب العلم', en: 'Seeker of knowledge', fr: 'Chercheur de savoir' } },
  { level: 5, points: 600, names: { ar: 'حارس الحكايات', en: 'Guardian of stories', fr: 'Gardien des récits' } },
  { level: 6, points: 1000, names: { ar: 'سراج المجتمع', en: 'Community luminary', fr: 'Lumière de la communauté' } }
];

const TIME_ZONE = 'Europe/Paris';
const DAY_MS = 24 * 60 * 60 * 1000;

function numericResult(type, current, target) {
  const currentValue = Number.isFinite(Number(current)) ? Math.max(0, Number(current)) : 0;
  const targetValue = Math.max(1, Number(target) || 1);
  return {
    type,
    currentValue,
    targetValue,
    unlocked: currentValue >= targetValue,
    progress: Math.min(1, currentValue / targetValue),
    manual: false
  };
}

/** Progress of one badge for one reader. */
function evaluateCriteria(criteria = {}, stats = {}) {
  const type = criteria.type;
  const target = Number(criteria.threshold) || 0;
  switch (type) {
    case 'stories_completed':
      return numericResult(type, stats.storiesCompleted, target);
    case 'parts_read':
      return numericResult(type, stats.partsRead, target);
    case 'streak_days':
      return numericResult(type, stats.currentStreak, target);
    case 'quizzes_completed':
      return numericResult(type, stats.quizzesCompleted, target);
    case 'perfect_quiz_scores':
      return numericResult(type, stats.perfectQuizScores, target);
    case 'collection_completed': {
      const collections = stats.collections || {};
      if (criteria.collectionId) {
        const done = collections[String(criteria.collectionId)] === true;
        return { type, currentValue: done ? 1 : 0, targetValue: 1, unlocked: done, progress: done ? 1 : 0, manual: false, collectionId: criteria.collectionId };
      }
      return numericResult(type, stats.collectionsCompleted, 1);
    }
    case 'weekly_challenge_rank': {
      const best = Number(stats.bestWeeklyRank);
      const unlocked = Number.isFinite(best) && best > 0 && best <= Math.max(1, target);
      return {
        type,
        currentValue: unlocked ? 1 : 0,
        targetValue: 1,
        unlocked,
        progress: unlocked ? 1 : 0,
        manual: false,
        rank: Number.isFinite(best) ? best : null,
        targetRank: Math.max(1, target)
      };
    }
    case 'team_joined':
      return numericResult(type, Math.max(0, Number(stats.teamsJoined) || 0), 1);
    case 'early_supporter': {
      const support = (Number(stats.donations) || 0) + (Number(stats.activeSubscriptions) || 0);
      return numericResult(type, support, 1);
    }
    case 'event_participation': {
      const tags = Array.isArray(stats.eventTags) ? stats.eventTags : [];
      const wanted = String(criteria.eventTag || '').trim();
      const joined = wanted ? tags.includes(wanted) : tags.length > 0;
      return { type, currentValue: joined ? 1 : 0, targetValue: 1, unlocked: joined, progress: joined ? 1 : 0, manual: false };
    }
    case 'manual':
    default:
      return { type: type || 'manual', currentValue: 0, targetValue: 0, unlocked: false, progress: 0, manual: true };
  }
}

/** Level ring data for a points total. */
function levelForPoints(points, levels = DEFAULT_LEVELS) {
  const list = (Array.isArray(levels) && levels.length ? levels : DEFAULT_LEVELS)
    .map((entry) => ({ ...entry, points: Number(entry.points) || 0 }))
    .sort((a, b) => a.points - b.points);
  const total = Math.max(0, Number(points) || 0);
  const current = [...list].reverse().find((entry) => total >= entry.points) || list[0];
  const next = list.find((entry) => entry.points > current.points) || null;
  const span = next ? next.points - current.points : 0;
  return {
    level: current.level,
    names: current.names || {},
    points: total,
    currentLevelPoints: current.points,
    nextLevel: next ? { level: next.level, points: next.points, names: next.names || {} } : null,
    pointsToNext: next ? Math.max(0, next.points - total) : 0,
    progressPercent: next ? Math.min(100, Math.round(((total - current.points) / span) * 100)) : 100
  };
}

function levelName(level, language = 'ar') {
  if (!level) return '';
  const names = level.names || {};
  return names[language] || names.ar || names.en || names.fr || '';
}

function dayKey(value, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function shiftDay(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

function bestStreakFromDays(days) {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const key of sorted) {
    run = previous && shiftDay(previous, 1) === key ? run + 1 : 1;
    previous = key;
    if (run > best) best = run;
  }
  return best;
}

/** Timezone-safe current and best streak, plus a 7-day status row. */
function computeStreak(dates = [], { now = new Date(), timeZone = TIME_ZONE } = {}) {
  const days = new Set(dates.filter(Boolean).map((value) => dayKey(value, timeZone)));
  const today = dayKey(now, timeZone);
  let current = 0;
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  if (days.has(cursor)) {
    while (days.has(cursor)) {
      current += 1;
      cursor = shiftDay(cursor, -1);
    }
  }
  const week = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const key = shiftDay(today, -offset);
    week.push({
      date: key,
      status: key === today ? (days.has(key) ? 'today' : 'today_pending') : days.has(key) ? 'done' : 'missed'
    });
  }
  return { current, best: bestStreakFromDays(days), week, activeDays: days.size };
}

/** Secret badges stay masked until the reader unlocks them. */
function badgeState({ badge, award, progress, isAdmin = false }) {
  const unlocked = Boolean(award);
  if (!isAdmin && badge.isSecret && !unlocked) {
    return {
      state: 'secret',
      unlocked: false,
      hidden: true,
      name: null,
      description: null,
      howToEarn: null,
      currentValue: 0,
      // A secret badge must not reveal its threshold before it is unlocked.
      targetValue: 0,
      progress: 0,
      canFeature: false
    };
  }
  return {
    state: unlocked ? 'unlocked' : progress?.progress > 0 ? 'in_progress' : 'locked',
    unlocked,
    hidden: false,
    currentValue: progress?.currentValue ?? 0,
    targetValue: progress?.targetValue ?? 0,
    progress: progress?.progress ?? 0,
    canFeature: unlocked
  };
}

function canFeatureBadge(currentlyFeatured, award) {
  if (!award) return false;
  if (award.isFeatured) return true;
  return currentlyFeatured < MAX_FEATURED_BADGES;
}

module.exports = {
  CRITERIA_TYPES,
  TIERS,
  CATEGORIES,
  MAX_FEATURED_BADGES,
  DEFAULT_LEVELS,
  TIME_ZONE,
  evaluateCriteria,
  levelForPoints,
  levelName,
  computeStreak,
  dayKey,
  badgeState,
  canFeatureBadge
};
