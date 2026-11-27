const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  partAccess,
  partStates,
  publishedParts,
  comingSoonPart,
  completedIdSet,
  previousPart,
  storyFinished,
  nextPartAfter
} = require('../utils/storySequence');

const { app } = require('../index');
const { Collection, Story, StoryPart, Quiz, ReadingProgress, Certificate, User, sequelize } = require('../models');
const { hashPassword } = require('../utils/security');
const { createSessionToken } = require('../utils/sessionToken');

/* ------------------------------------------------------------------ */
/* Pure engine                                                         */
/* ------------------------------------------------------------------ */

function fakeStory(parts, overrides = {}) {
  return {
    id: 1,
    title: 'Test story',
    isFree: true,
    collection: { isFree: true },
    parts,
    ...overrides
  };
}

function fakePart(id, partNumber, overrides = {}) {
  return {
    id,
    partNumber,
    title: `Part ${partNumber}`,
    status: 'published',
    isFree: false,
    releaseAt: null,
    earlyAccessUntil: null,
    ...overrides
  };
}

test('une partie 2 est bloquée tant que la partie 1 n’est pas terminée', async () => {
  const story = fakeStory([fakePart(11, 1), fakePart(12, 2)]);
  const issue = await partAccess({ story, part: story.parts[1], user: { id: 7, role: 'READER' }, completedIds: new Set(), accessible: true });
  assert.equal(issue.code, 'SEQUENCE_LOCKED');
  assert.equal(issue.requiredPartNumber, 1);

  const firstOpen = await partAccess({ story, part: story.parts[0], user: { id: 7, role: 'READER' }, completedIds: new Set(), accessible: true });
  assert.equal(firstOpen, null);
});

test('un visiteur qui demande la partie 2 reçoit LOGIN_REQUIRED', async () => {
  const story = fakeStory([fakePart(11, 1), fakePart(12, 2)]);
  const issue = await partAccess({ story, part: story.parts[1], user: null, completedIds: new Set(), accessible: false });
  assert.equal(issue.code, 'LOGIN_REQUIRED');
});

test('une partie déjà terminée ne contourne jamais le paywall', async () => {
  const story = fakeStory([fakePart(12, 2)]);
  // Finished parts skip the reading-order rule, but a lapsed subscription locks them.
  const locked = await partAccess({ story, part: story.parts[0], user: { id: 7, role: 'READER' }, completedIds: new Set([12]), accessible: false });
  assert.equal(locked.code, 'SUBSCRIPTION_REQUIRED');
  const open = await partAccess({ story, part: story.parts[0], user: { id: 7, role: 'READER' }, completedIds: new Set([12]), accessible: true });
  assert.equal(open, null);
});

test('une partie à venir ne divulgue jamais de contenu, même pour un admin', async () => {
  const story = fakeStory([fakePart(11, 1), fakePart(13, 2, { status: 'coming_soon' })]);
  const issue = await partAccess({ story, part: story.parts[1], user: { id: 1, role: 'SUPER_ADMIN' }, completedIds: new Set(), accessible: true });
  assert.equal(issue.code, 'COMING_SOON');
  assert.equal(publishedParts(story).length, 1);
  assert.equal(comingSoonPart(story).id, 13);
});

test('les rôles éditoriaux peuvent prévisualiser une partie verrouillée', async () => {
  const story = fakeStory([fakePart(11, 1), fakePart(12, 2)]);
  for (const role of ['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER']) {
    const issue = await partAccess({ story, part: story.parts[1], user: { id: 3, role }, completedIds: new Set(), accessible: false });
    assert.equal(issue, null, role);
  }
});

test('les statuts de la page histoire suivent l’ordre de lecture', async () => {
  const story = fakeStory([
    fakePart(11, 1),
    fakePart(12, 2),
    fakePart(13, 3),
    fakePart(14, 4, { status: 'coming_soon' })
  ]);
  const states = await partStates({ story, user: { id: 7, role: 'READER' }, completedIds: new Set([11]), accessibleFor: () => true });
  assert.deepEqual(states.map((entry) => entry.status), ['completed', 'current', 'locked_sequence', 'coming_soon']);
});

test('terminer une histoire ignore la partie à venir', () => {
  const story = fakeStory([fakePart(11, 1), fakePart(12, 2), fakePart(14, 3, { status: 'coming_soon' })]);
  assert.equal(storyFinished(story, completedIdSet({ completedParts: [11, 12] })), true);
  assert.equal(storyFinished(story, completedIdSet({ completedParts: [11] })), false);
  assert.equal(nextPartAfter(story, story.parts[0]).partNumber, 2);
  assert.equal(previousPart(story, story.parts[1]).partNumber, 1);
});

/* ------------------------------------------------------------------ */
/* HTTP: real routes and database                                      */
/* ------------------------------------------------------------------ */

const suffix = crypto.randomUUID().slice(0, 8);
let server;
let baseUrl;
let collection;
let story;
let parts;
let upcoming;
let reader;
let editor;
let readerToken;
let editorToken;

async function startServer() {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
}

async function jsonFetch(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}

test.before(async () => {
  await startServer();
  collection = await Collection.create({
    title: `Sequence test ${suffix}`,
    slug: `sequence-test-${suffix}`,
    translations: {},
    isFree: true,
    isActive: true
  });
  story = await Story.create({
    collectionId: collection.id,
    title: `Histoire séquence ${suffix}`,
    slug: `histoire-sequence-${suffix}`,
    summary: 'Test',
    translations: {},
    type: 'history',
    sourceBadge: 'historical_source',
    sourceReferences: [{ label: 'test' }],
    reviewChecklist: {},
    status: 'published',
    isFree: true
  });
  parts = [];
  for (const partNumber of [1, 2, 3]) {
    parts.push(await StoryPart.create({
      storyId: story.id,
      partNumber,
      title: `Partie ${partNumber}`,
      content: `Contenu arabe de la partie ${partNumber}`,
      translations: {},
      endingHook: `Hook ${partNumber}`,
      estimatedReadingMinutes: 3
    }));
  }
  upcoming = await StoryPart.create({
    storyId: story.id,
    partNumber: 4,
    title: 'Épisode à venir',
    content: '',
    translations: {},
    endingHook: '',
    status: 'coming_soon',
    expectedAt: new Date('2027-01-15T00:00:00.000Z'),
    teaser: { ar: 'قريبًا', en: 'Soon', fr: 'Bientôt' }
  });
  const passwordHash = await hashPassword('SequenceTest!2026');
  reader = await User.create({
    firstName: 'Seq', lastName: 'Reader',
    email: `seq.reader.${suffix}@qa.test`,
    passwordHash, role: 'READER', status: 'ACTIVE',
    language: 'fr', emailVerifiedAt: new Date()
  });
  editor = await User.create({
    firstName: 'Seq', lastName: 'Editor',
    email: `seq.editor.${suffix}@qa.test`,
    passwordHash, role: 'EDITOR', status: 'ACTIVE',
    language: 'fr', emailVerifiedAt: new Date()
  });
  readerToken = createSessionToken(reader);
  editorToken = createSessionToken(editor);
});

test.after(async () => {
  if (story) {
    await ReadingProgress.destroy({ where: { storyId: story.id } }).catch(() => {});
    await Quiz.destroy({ where: { storyId: story.id } }).catch(() => {});
    await StoryPart.destroy({ where: { storyId: story.id } }).catch(() => {});
    await story.destroy().catch(() => {});
  }
  if (collection) await collection.destroy().catch(() => {});
  for (const user of [reader, editor]) {
    if (!user) continue;
    await ReadingProgress.destroy({ where: { userId: user.id } }).catch(() => {});
    await user.destroy().catch(() => {});
  }
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('HTTP: un visiteur reçoit LOGIN_REQUIRED sur la partie 2', async () => {
  const response = await jsonFetch(`/stories/${story.slug}/parts/2`);
  assert.equal(response.status, 401);
  assert.equal(response.payload.code, 'LOGIN_REQUIRED');
});

test('HTTP: ouvrir la partie 2 sans la partie 1 est refusé (SEQUENCE_LOCKED)', async () => {
  const response = await jsonFetch(`/stories/${story.slug}/parts/2`, { token: readerToken });
  assert.equal(response.status, 403);
  assert.equal(response.payload.code, 'SEQUENCE_LOCKED');
  assert.equal(response.payload.requiredPartNumber, 1);
  assert.equal(response.payload.content, undefined);
});

test('HTTP: terminer la partie 3 sans la partie 2 est refusé, avant et après le nouveau endpoint', async () => {
  const complete = await jsonFetch(`/stories/${story.slug}/parts/3/complete`, { token: readerToken, method: 'POST' });
  assert.equal(complete.status, 403);
  assert.equal(complete.payload.code, 'SEQUENCE_LOCKED');
  const legacy = await jsonFetch(`/reading-progress/${story.id}`, {
    token: readerToken,
    method: 'PUT',
    body: { lastPartId: parts[2].id, completedParts: [parts[2].id] }
  });
  assert.equal(legacy.status, 409);
  assert.equal(legacy.payload.code, 'SEQUENCE_LOCKED');
});

test('HTTP: terminer une partie deux fois ne donne pas de points en plus', async () => {
  const first = await jsonFetch(`/stories/${story.slug}/parts/1/complete`, { token: readerToken, method: 'POST' });
  assert.equal(first.status, 200);
  assert.equal(first.payload.alreadyCompleted, false);
  const pointsAfterFirst = (await User.findByPk(reader.id)).points;
  const second = await jsonFetch(`/stories/${story.slug}/parts/1/complete`, { token: readerToken, method: 'POST' });
  assert.equal(second.status, 200);
  assert.equal(second.payload.alreadyCompleted, true);
  assert.equal(second.payload.nextPart.partNumber, 2);
  const pointsAfterSecond = (await User.findByPk(reader.id)).points;
  assert.equal(pointsAfterSecond, pointsAfterFirst);
});

test('HTTP: après la partie 1, la partie 2 s’ouvre', async () => {
  const response = await jsonFetch(`/stories/${story.slug}/parts/2`, { token: readerToken });
  assert.equal(response.status, 200);
  assert.match(response.payload.content, /partie 2/i);
  // Opening a part remembers it as the last part read.
  const saved = await ReadingProgress.findOne({ where: { userId: reader.id, storyId: story.id } });
  assert.equal(saved.lastPartId, parts[1].id);
});

test('HTTP: une partie à venir ne fuit aucun contenu', async () => {
  const response = await jsonFetch(`/stories/${story.slug}/parts/4`, { token: readerToken });
  assert.equal(response.status, 404);
  assert.equal(response.payload.code, 'COMING_SOON');
  const storyResponse = await jsonFetch(`/stories/${story.slug}`, { token: readerToken });
  const comingSoon = storyResponse.payload.parts.find((part) => part.status === 'coming_soon');
  assert.equal(comingSoon.title, 'Épisode à venir');
  assert.equal(comingSoon.content, undefined);
  assert.equal(storyResponse.payload.upcomingPart.partNumber, 4);
});

test('HTTP: un éditeur prévisualise une partie verrouillée', async () => {
  const response = await jsonFetch(`/stories/${story.slug}/parts/3`, { token: editorToken });
  assert.equal(response.status, 200);
  assert.match(response.payload.content, /partie 3/i);
});

test('HTTP: une histoire terminée redevient "en cours" quand une partie est publiée', async () => {
  const completeTwo = await jsonFetch(`/stories/${story.slug}/parts/2/complete`, { token: readerToken, method: 'POST' });
  assert.equal(completeTwo.status, 200);
  const completeThree = await jsonFetch(`/stories/${story.slug}/parts/3/complete`, { token: readerToken, method: 'POST' });
  assert.equal(completeThree.status, 200);
  assert.equal(completeThree.payload.storyFinished, true);
  assert.equal(completeThree.payload.upcomingPart.partNumber, 4);

  // Publishing the placeholder keeps its id and its position.
  await upcoming.update({ status: 'published', content: 'Contenu arabe de la nouvelle partie', endingHook: 'Hook' });
  const storyResponse = await jsonFetch(`/stories/${story.slug}`, { token: readerToken });
  assert.equal(storyResponse.payload.progress.finished, false);
  assert.equal(storyResponse.payload.progress.currentPartNumber, 4);
  assert.equal(storyResponse.payload.upcomingPart, null);
  const statuses = storyResponse.payload.parts.map((part) => [part.partNumber, part.status]);
  assert.deepEqual(statuses, [[1, 'completed'], [2, 'completed'], [3, 'completed'], [4, 'current']]);
  await upcoming.update({ status: 'coming_soon', content: '', endingHook: '' });
});

test('HTTP: rejouer la fin d’une histoire déjà terminée enregistre sans erreur', async () => {
  const replay = await jsonFetch(`/stories/${story.slug}/parts/3/complete`, { token: readerToken, method: 'POST' });
  assert.equal(replay.status, 200);
  assert.equal(replay.payload.alreadyCompleted, true);
  assert.equal(replay.payload.storyFinished, true);
  assert.ok(replay.payload.completion, 'the end-of-story summary is replayed');
  const certificates = await Certificate.count({ where: { userId: reader.id, storyId: story.id } });
  assert.equal(certificates, 1);
  const progress = await ReadingProgress.findOne({ where: { userId: reader.id, storyId: story.id } });
  assert.equal(progress.completedParts.length, parts.length);
});

test('HTTP: les quiz d’une partie verrouillée sont refusés', async () => {
  const newReader = await User.create({
    firstName: 'Quiz', lastName: 'Reader',
    email: `seq.quiz.${suffix}@qa.test`,
    passwordHash: await hashPassword('SequenceTest!2026'),
    role: 'READER', status: 'ACTIVE', language: 'fr', emailVerifiedAt: new Date()
  });
  const newReaderToken = createSessionToken(newReader);
  const firstOnly = await jsonFetch(`/reading-progress/${story.id}`, {
    token: newReaderToken,
    method: 'PUT',
    body: { lastPartId: parts[0].id, completedParts: [parts[0].id] }
  });
  assert.equal(firstOnly.status, 200);
  const quiz = await Quiz.create({
    storyId: story.id,
    partId: parts[2].id,
    title: `Quiz partie 3 ${suffix}`,
    slug: `quiz-part3-${suffix}`,
    difficulty: 'kids',
    status: 'published',
    accessMode: 'follow_part',
    translations: {}
  });
  const locked = await jsonFetch(`/stories/${story.slug}/parts/3/quiz`, { token: newReaderToken });
  assert.equal(locked.status, 403);
  assert.equal(locked.payload.code, 'SEQUENCE_LOCKED');
  const asEditor = await jsonFetch(`/stories/${story.slug}/parts/3/quiz`, { token: editorToken });
  assert.equal(asEditor.status, 200);
  assert.equal(asEditor.payload.id, quiz.id);
  await ReadingProgress.destroy({ where: { userId: newReader.id } });
  await newReader.destroy().catch(() => {});
});

test('HTTP: l’ancienne progression reste valide et n’est jamais effacée', async () => {
  const legacyUser = await User.create({
    firstName: 'Legacy', lastName: 'Reader',
    email: `seq.legacy.${suffix}@qa.test`,
    passwordHash: await hashPassword('SequenceTest!2026'),
    role: 'READER', status: 'ACTIVE', language: 'ar', emailVerifiedAt: new Date()
  });
  const token = createSessionToken(legacyUser);
  // Progress saved before the sequence rule: part 1 and part 3, with a gap.
  const saved = await jsonFetch(`/reading-progress/${story.id}`, {
    token,
    method: 'PUT',
    body: { lastPartId: parts[0].id, completedParts: [parts[0].id] }
  });
  assert.equal(saved.status, 200);
  const stored = await ReadingProgress.findOne({ where: { userId: legacyUser.id, storyId: story.id } });
  assert.deepEqual(stored.completedParts, [parts[0].id]);
  const stillReadable = await jsonFetch(`/stories/${story.slug}/parts/1`, { token });
  assert.equal(stillReadable.status, 200);
  await ReadingProgress.destroy({ where: { userId: legacyUser.id } });
  await legacyUser.destroy().catch(() => {});
});

test.after(async () => {
  await sequelize.close().catch(() => {});
});
