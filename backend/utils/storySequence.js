const { canAccessPart } = require('./contentAccess');

const privilegedRoles = new Set(['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER']);

/**
 * Reading-order engine. Every rule about "can this reader open this part, and
 * why not" lives here so the part endpoint, the quiz endpoint, the old
 * PUT /reading-progress and the new completion endpoint cannot drift apart.
 *
 * Error codes, checked in this order (first match wins):
 *   COMING_SOON            placeholder without content
 *   LOGIN_REQUIRED         visitor asking for part 2 or later
 *   SEQUENCE_LOCKED        the previous published part is not completed
 *   SUBSCRIPTION_REQUIRED  the existing premium rule refuses access
 */

function isPrivileged(role) {
  return privilegedRoles.has(role);
}

function isComingSoon(part) {
  return Boolean(part && part.status === 'coming_soon');
}

/** Real parts, in reading order (placeholders excluded). */
function publishedParts(story) {
  return [...(story?.parts || [])]
    .filter((part) => !isComingSoon(part))
    .sort((left, right) => left.partNumber - right.partNumber);
}

/** At most one placeholder per story, always the last one. */
function comingSoonPart(story) {
  return [...(story?.parts || [])]
    .filter((part) => isComingSoon(part))
    .sort((left, right) => left.partNumber - right.partNumber)[0] || null;
}

function completedIdSet(progress) {
  const raw = Array.isArray(progress?.completedParts) ? progress.completedParts : [];
  return new Set(raw.map((id) => Number(id)).filter(Number.isFinite));
}

/** The part right before `part` among the published parts, or null for part 1. */
function previousPart(story, part) {
  const parts = publishedParts(story);
  const index = parts.findIndex((candidate) => candidate.id === part.id);
  return index > 0 ? parts[index - 1] : null;
}

/**
 * Access decision for one part.
 * Returns null when the reader may open it, or { code, message, status, requiredPartNumber }.
 */
async function partAccess({ story, part, user, completedIds, accessible }) {
  if (!part) return { code: 'PART_NOT_FOUND', status: 404, message: 'Partie introuvable.' };
  if (isComingSoon(part)) {
    return { code: 'COMING_SOON', status: 404, message: 'Cette partie n’est pas encore disponible.' };
  }
  if (isPrivileged(user?.role)) return null;
  // A part the reader already finished stays readable forever, even after a
  // reorder or when it becomes premium.
  if (completedIds?.has(part.id)) return null;
  if (!user && part.partNumber >= 2) {
    return {
      code: 'LOGIN_REQUIRED',
      status: 401,
      message: 'Créez un compte gratuit pour continuer la lecture.',
      requiredPartNumber: 1
    };
  }
  const previous = previousPart(story, part);
  if (previous && !completedIds?.has(previous.id)) {
    return {
      code: 'SEQUENCE_LOCKED',
      status: 403,
      message: `Terminez d’abord la partie ${previous.partNumber}.`,
      requiredPartNumber: previous.partNumber
    };
  }
  const allowed = typeof accessible === 'boolean'
    ? accessible
    : await canAccessPart({ userId: user?.id, role: user?.role, story, part });
  if (!allowed) {
    if (!user) {
      return {
        code: 'LOGIN_REQUIRED',
        status: 401,
        message: 'Créez un compte gratuit pour continuer la lecture.',
        requiredPartNumber: 1
      };
    }
    return {
      code: 'SUBSCRIPTION_REQUIRED',
      status: 403,
      message: 'Un abonnement actif est requis pour cette partie.'
    };
  }
  return null;
}

/**
 * Status of every part for the story page: completed, current, available,
 * locked_sequence, locked_subscription, login_required, coming_soon, upcoming.
 */
async function partStates({ story, user, completedIds, accessibleFor }) {
  const parts = publishedParts(story);
  const states = [];
  let currentAssigned = false;
  for (const part of parts) {
    const isCompleted = completedIds.has(part.id);
    if (isCompleted) {
      states.push({ part, status: 'completed' });
      continue;
    }
    const accessible = accessibleFor
      ? await accessibleFor(part)
      : await canAccessPart({ userId: user?.id, role: user?.role, story, part });
    const issue = await partAccess({ story, part, user, completedIds, accessible });
    let status;
    if (!issue) {
      status = currentAssigned ? 'available' : 'current';
      currentAssigned = true;
    } else if (issue.code === 'LOGIN_REQUIRED') {
      status = 'login_required';
    } else if (issue.code === 'SEQUENCE_LOCKED') {
      status = 'locked_sequence';
    } else if (issue.code === 'COMING_SOON') {
      status = 'coming_soon';
    } else {
      status = 'locked_subscription';
    }
    states.push({ part, status, issue });
  }
  const upcoming = comingSoonPart(story);
  if (upcoming) states.push({ part: upcoming, status: 'coming_soon' });
  return states;
}

/** First part the reader may open and has not finished yet. */
function firstReadablePartNumber(states) {
  return states.find((entry) => entry.status === 'current')?.part.partNumber || null;
}

/** True when every published part is completed. */
function storyFinished(story, completedIds) {
  const parts = publishedParts(story);
  return parts.length > 0 && parts.every((part) => completedIds.has(part.id));
}

/**
 * True when a reader who had finished what existed now has something new to
 * read: the next part is numbered after everything they completed.
 */
function newPartAvailable(story, completedIds) {
  const parts = publishedParts(story);
  const completedNumbers = parts
    .filter((part) => completedIds.has(part.id))
    .map((part) => part.partNumber);
  if (!completedNumbers.length) return false;
  const next = parts.find((part) => !completedIds.has(part.id));
  if (!next) return false;
  return next.partNumber > Math.max(...completedNumbers);
}

/** Next published part after `part`, if any. */
function nextPartAfter(story, part) {
  const parts = publishedParts(story);
  const index = parts.findIndex((candidate) => candidate.id === part.id);
  return index >= 0 ? parts[index + 1] || null : null;
}

module.exports = {
  privilegedRoles,
  isPrivileged,
  isComingSoon,
  publishedParts,
  comingSoonPart,
  completedIdSet,
  previousPart,
  partAccess,
  partStates,
  firstReadablePartNumber,
  storyFinished,
  newPartAvailable,
  nextPartAfter
};
