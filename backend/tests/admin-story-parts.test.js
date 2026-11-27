const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Op } = require('sequelize');

const { app } = require('../index');
const {
  Collection,
  Story,
  StoryPart,
  ReadingProgress,
  Quiz,
  ScheduledReminder,
  EmailTemplate,
  User,
  sequelize
} = require('../models');
const { hashPassword } = require('../utils/security');
const { createSessionToken } = require('../utils/sessionToken');

const suffix = crypto.randomUUID().slice(0, 8);
let server;
let baseUrl;
let collection;
let story;
let singlePartStory;
let soloStory;
let parts;
let upcoming;
let singlePart;
let soloPart;
let finisher;
let partial;
let muted;
let editorToken;
let publisher;
let publisherToken;

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

async function partNumbers(storyId) {
  const rows = await StoryPart.findAll({
    where: { storyId },
    order: [['partNumber', 'ASC']],
    attributes: ['id', 'partNumber', 'status']
  });
  return rows.map((row) => [row.id, row.partNumber, row.status]);
}

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  collection = await Collection.create({
    title: `Admin parts ${suffix}`,
    slug: `admin-parts-${suffix}`,
    translations: {},
    isFree: true,
    isActive: true
  });
  const storyDefaults = {
    collectionId: collection.id,
    summary: 'Test',
    translations: {},
    type: 'history',
    sourceBadge: 'historical_source',
    sourceReferences: [{ label: 'test' }],
    reviewChecklist: {},
    status: 'published',
    isFree: true
  };
  story = await Story.create({
    ...storyDefaults,
    title: `Histoire admin ${suffix}`,
    slug: `histoire-admin-${suffix}`
  });
  singlePartStory = await Story.create({
    ...storyDefaults,
    title: `Histoire unique ${suffix}`,
    slug: `histoire-unique-${suffix}`
  });
  soloStory = await Story.create({
    ...storyDefaults,
    title: `Histoire seule ${suffix}`,
    slug: `histoire-seule-${suffix}`
  });

  parts = [];
  for (const partNumber of [1, 2]) {
    parts.push(await StoryPart.create({
      storyId: story.id,
      partNumber,
      title: `Partie ${partNumber}`,
      content: `Contenu arabe ${partNumber}`,
      translations: {},
      endingHook: `Hook ${partNumber}`,
      estimatedReadingMinutes: 3
    }));
  }
  upcoming = await StoryPart.create({
    storyId: story.id,
    partNumber: 3,
    title: 'Épisode à venir',
    content: '',
    translations: {},
    endingHook: '',
    status: 'coming_soon',
    expectedAt: new Date('2027-02-01T00:00:00.000Z'),
    teaser: { ar: 'قريبًا', en: 'Soon', fr: 'Bientôt' }
  });
  singlePart = await StoryPart.create({
    storyId: singlePartStory.id,
    partNumber: 1,
    title: 'Partie unique',
    content: 'Contenu arabe unique',
    translations: {},
    endingHook: 'Hook',
    estimatedReadingMinutes: 3
  });
  soloPart = await StoryPart.create({
    storyId: soloStory.id,
    partNumber: 1,
    title: 'Seule partie publiée',
    content: 'Contenu arabe de la seule partie',
    translations: {},
    endingHook: 'Hook',
    estimatedReadingMinutes: 3
  });

  const passwordHash = await hashPassword('AdminParts!2026');
  const reader = async (name, completedParts, emailPreferences) => User.create({
    firstName: name,
    lastName: 'Reader',
    email: `admin.parts.${name.toLowerCase()}.${suffix}@qa.test`,
    passwordHash,
    role: 'READER',
    status: 'ACTIVE',
    language: 'fr',
    emailVerifiedAt: new Date(),
    ...(emailPreferences ? { emailPreferences } : {})
  });
  finisher = await reader('Finisher', [parts[0].id, parts[1].id]);
  partial = await reader('Partial', [parts[0].id]);
  muted = await reader('Muted', [parts[0].id, parts[1].id], { marketing: true, reminders: false });

  const editor = await User.create({
    firstName: 'Admin',
    lastName: 'Editor',
    email: `admin.parts.editor.${suffix}@qa.test`,
    passwordHash,
    role: 'EDITOR',
    status: 'ACTIVE',
    language: 'fr',
    emailVerifiedAt: new Date()
  });
  editorToken = createSessionToken(editor);

  // Republishing the story after a part edit is a publisher action.
  publisher = await User.create({
    firstName: 'Admin',
    lastName: 'Publisher',
    email: `admin.parts.publisher.${suffix}@qa.test`,
    passwordHash,
    role: 'ADMIN',
    status: 'ACTIVE',
    language: 'fr',
    emailVerifiedAt: new Date()
  });
  publisherToken = createSessionToken(publisher);

  for (const [user, completedParts] of [
    [finisher, [parts[0].id, parts[1].id]],
    [partial, [parts[0].id]],
    [muted, [parts[0].id, parts[1].id]]
  ]) {
    await ReadingProgress.create({
      userId: user.id,
      storyId: story.id,
      lastPartId: completedParts[completedParts.length - 1],
      completedParts
    });
  }
});

test.after(async () => {
  const storyIds = [story?.id, singlePartStory?.id, soloStory?.id].filter(Boolean);
  for (const storyId of storyIds) {
    await ReadingProgress.destroy({ where: { storyId } }).catch(() => {});
    await Quiz.destroy({ where: { storyId } }).catch(() => {});
  }
  if (story) await ScheduledReminder.destroy({
    where: { dedupeKey: { [Op.like]: 'story-part-published:%' } }
  }).catch(() => {});
  for (const storyId of storyIds) {
    await StoryPart.destroy({ where: { storyId } }).catch(() => {});
  }
  for (const model of [story, singlePartStory, soloStory]) {
    if (model) await model.destroy().catch(() => {});
  }
  if (collection) await collection.destroy().catch(() => {});
  for (const user of [finisher, partial, muted, publisher]) {
    if (!user) continue;
    await ReadingProgress.destroy({ where: { userId: user.id } }).catch(() => {});
    await ScheduledReminder.destroy({ where: { userId: user.id } }).catch(() => {});
    await user.destroy().catch(() => {});
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await sequelize.close().catch(() => {});
});

test('HTTP: une histoire ne peut avoir qu’une seule partie à venir', async () => {
  const response = await jsonFetch(`/admin/content/stories/${story.id}/parts`, {
    token: editorToken,
    method: 'POST',
    body: { partNumber: 4, title: 'Autre épisode à venir', status: 'coming_soon' }
  });
  assert.equal(response.status, 409);
  assert.equal(response.payload.code, 'UPCOMING_PART_EXISTS');
  assert.deepEqual((await partNumbers(story.id)).map((row) => row[1]), [1, 2, 3]);
});

test('HTTP: une partie à venir créée est renumérotée après la dernière partie publiée', async () => {
  const response = await jsonFetch(`/admin/content/stories/${singlePartStory.id}/parts`, {
    token: editorToken,
    method: 'POST',
    body: { partNumber: 9, title: 'Suite à venir', status: 'coming_soon', expectedAt: '2027-03-01T00:00:00.000Z' }
  });
  assert.equal(response.status, 201);
  assert.equal(response.payload.status, 'coming_soon');
  assert.equal(response.payload.partNumber, 2);
  assert.equal(response.payload.content, '');

  const numbers = await partNumbers(singlePartStory.id);
  assert.deepEqual(numbers.map((row) => row[1]), [1, 2]);
  assert.equal(numbers[1][2], 'coming_soon');
  await Story.update({ status: 'published' }, { where: { id: singlePartStory.id } });
});

test('HTTP: un déplacement renumérote les parties 1..N et garde la partie à venir en dernier', async () => {
  const response = await jsonFetch(`/admin/content/parts/${parts[1].id}/move`, {
    token: editorToken,
    method: 'POST',
    body: { direction: 'up' }
  });
  assert.equal(response.status, 200);
  const order = response.payload.map((entry) => entry.id);
  assert.deepEqual(order, [parts[1].id, parts[0].id, upcoming.id]);
  assert.deepEqual(response.payload.map((entry) => entry.partNumber), [1, 2, 3]);
  assert.equal(response.payload[2].status, 'coming_soon');

  // Moving the placeholder up must not hide it before the story's parts.
  const placeholder = await jsonFetch(`/admin/content/parts/${upcoming.id}/move`, {
    token: editorToken,
    method: 'POST',
    body: { direction: 'up' }
  });
  assert.equal(placeholder.status, 200);
  const afterPlaceholderMove = await partNumbers(story.id);
  assert.deepEqual(afterPlaceholderMove.map((row) => row[1]), [1, 2, 3]);
  assert.equal(afterPlaceholderMove[2][2], 'coming_soon');

  const back = await jsonFetch(`/admin/content/parts/${parts[1].id}/move`, {
    token: editorToken,
    method: 'POST',
    body: { direction: 'down' }
  });
  assert.equal(back.status, 200);
  assert.deepEqual(back.payload.map((entry) => entry.id), [parts[0].id, parts[1].id, upcoming.id]);
});

test('HTTP: suppression d’une partie publiée puis renumérotation sans trou', async () => {
  const created = await jsonFetch(`/admin/content/stories/${story.id}/parts`, {
    token: editorToken,
    method: 'POST',
    body: { partNumber: 50, title: 'Partie ajoutée', content: 'نص عربي', endingHook: 'Hook' }
  });
  assert.equal(created.status, 201);
  // Published parts stay before the placeholder, so 50 becomes 3.
  assert.equal(created.payload.partNumber, 3);
  const withNewPart = await partNumbers(story.id);
  assert.deepEqual(withNewPart.map((row) => row[1]), [1, 2, 3, 4]);
  assert.equal(withNewPart[3][2], 'coming_soon');

  const deleted = await jsonFetch(`/admin/content/parts/${created.payload.id}`, {
    token: editorToken,
    method: 'DELETE'
  });
  assert.equal(deleted.status, 204);
  const afterDelete = await partNumbers(story.id);
  assert.deepEqual(afterDelete.map((row) => row[1]), [1, 2, 3]);
  assert.equal(afterDelete[2][2], 'coming_soon');
});

test('HTTP: /impact compte les lecteurs ayant terminé la partie', async () => {
  const first = await jsonFetch(`/admin/content/parts/${parts[0].id}/impact`, { token: editorToken });
  assert.equal(first.status, 200);
  assert.equal(first.payload.partId, parts[0].id);
  assert.equal(first.payload.completedBy, 3);
  assert.equal(first.payload.quizzes, 0);

  const second = await jsonFetch(`/admin/content/parts/${parts[1].id}/impact`, { token: editorToken });
  assert.equal(second.status, 200);
  assert.equal(second.payload.completedBy, 2);

  await Quiz.create({
    storyId: story.id,
    partId: parts[1].id,
    title: `Quiz impact ${suffix}`,
    slug: `quiz-impact-${suffix}`,
    difficulty: 'kids',
    status: 'published',
    accessMode: 'follow_part',
    translations: {}
  });
  const withQuiz = await jsonFetch(`/admin/content/parts/${parts[1].id}/impact`, { token: editorToken });
  assert.equal(withQuiz.payload.quizzes, 1);
  await Quiz.destroy({ where: { partId: parts[1].id } });
});

test('HTTP: la dernière partie publiée d’une histoire publiée ne peut être ni supprimée ni masquée', async () => {
  const deleted = await jsonFetch(`/admin/content/parts/${soloPart.id}`, {
    token: editorToken,
    method: 'DELETE'
  });
  assert.equal(deleted.status, 409);
  assert.equal(deleted.payload.code, 'LAST_PUBLISHED_PART');

  const hidden = await jsonFetch(`/admin/content/parts/${soloPart.id}`, {
    token: editorToken,
    method: 'PATCH',
    body: { status: 'coming_soon' }
  });
  assert.equal(hidden.status, 409);
  assert.equal(hidden.payload.code, 'LAST_PUBLISHED_PART');
  const stored = await StoryPart.findByPk(soloPart.id);
  assert.equal(stored.status, 'published');
  assert.match(stored.content, /seule partie/i);
});

test('HTTP: publier une partie à venir notifie uniquement les lecteurs concernés', async () => {
  const template = await EmailTemplate.findOne({ where: { code: 'story_part_published' } });
  assert.ok(template, 'the story_part_published template must be installed');
  assert.equal(template.isActive, true);

  await Story.update({ status: 'published' }, { where: { id: story.id } });
  const published = await jsonFetch(`/admin/content/parts/${upcoming.id}`, {
    token: editorToken,
    method: 'PATCH',
    body: {
      status: 'published',
      content: 'نص الجزء الثالث',
      endingHook: 'Hook 3'
    }
  });
  assert.equal(published.status, 200);
  assert.equal(published.payload.status, 'published');
  assert.equal(published.payload.partNumber, 3);

  // The edit sends the story back to review, so nothing is queued yet: the link
  // would point to an unreachable page.
  const review = await Story.findByPk(story.id);
  assert.equal(review.status, 'in_review');
  assert.equal(await ScheduledReminder.count({ where: { code: 'story_part_published' } }), 0);

  // Republishing the story is what makes the part readable again.
  await story.update({
    reviewChecklist: {
      sourcesProvided: true,
      reviewedBy: 'QA Editor',
      reviewedAt: new Date().toISOString(),
      representationConfirmed: true
    }
  });
  const republished = await jsonFetch(`/admin/content/stories/${story.id}/publish`, {
    token: publisherToken,
    method: 'POST'
  });
  assert.equal(republished.status, 200);
  assert.equal(republished.payload.status, 'published');

  const queued = await ScheduledReminder.findAll({
    where: { code: 'story_part_published' },
    order: [['userId', 'ASC']]
  });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].userId, finisher.id);
  assert.equal(queued[0].preferenceCategory, 'reminders');
  assert.equal(queued[0].dedupeKey, `story-part-published:${upcoming.id}:${finisher.id}`);
  assert.equal(queued[0].metadata.partNumber, 3);
  assert.equal(queued[0].metadata.storyTitle, story.title);
  assert.match(queued[0].metadata.actionUrl, new RegExp(`/fr/stories/${story.slug}$`));

  // The muted and the still-reading readers were skipped.
  assert.equal(queued.some((row) => row.userId === muted.id), false);
  assert.equal(queued.some((row) => row.userId === partial.id), false);
});
