const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { app } = require('../index');
const {
  Collection,
  Story,
  StoryPart,
  ReadingProgress,
  Plan,
  Subscription,
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
let parts;
let plan;
let subscription;
let reader;
let editor;
let readerToken;
let editorToken;

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
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  collection = await Collection.create({
    title: `Premium ${suffix}`,
    slug: `premium-${suffix}`,
    translations: {},
    isFree: false,
    isActive: true
  });
  story = await Story.create({
    collectionId: collection.id,
    title: `Histoire premium ${suffix}`,
    slug: `histoire-premium-${suffix}`,
    summary: 'Premium',
    translations: {},
    type: 'history',
    sourceBadge: 'historical_source',
    sourceReferences: [{ label: 'test' }],
    reviewChecklist: {},
    status: 'published',
    isFree: false
  });
  parts = [];
  for (const partNumber of [1, 2]) {
    parts.push(await StoryPart.create({
      storyId: story.id,
      partNumber,
      title: `Partie ${partNumber}`,
      content: `Contenu premium ${partNumber}`,
      translations: {},
      endingHook: `Hook ${partNumber}`,
      estimatedReadingMinutes: 3,
      isFree: false
    }));
  }
  plan = await Plan.create({
    name: `Plan ${suffix}`,
    slug: `plan-${suffix}`,
    price: 9.9,
    currency: 'EUR',
    interval: 'month',
    features: ['all stories'],
    isActive: true
  });
  const passwordHash = await hashPassword('Gating!2026');
  reader = await User.create({
    firstName: 'Gated',
    lastName: 'Reader',
    email: `gating.reader.${suffix}@qa.test`,
    passwordHash,
    role: 'READER',
    status: 'ACTIVE',
    language: 'fr',
    emailVerifiedAt: new Date()
  });
  editor = await User.create({
    firstName: 'Gated',
    lastName: 'Editor',
    email: `gating.editor.${suffix}@qa.test`,
    passwordHash,
    role: 'EDITOR',
    status: 'ACTIVE',
    language: 'fr',
    emailVerifiedAt: new Date()
  });
  readerToken = createSessionToken(reader);
  editorToken = createSessionToken(editor);
  // Progress saved while the reader still paid: every part is finished.
  await ReadingProgress.create({
    userId: reader.id,
    storyId: story.id,
    lastPartId: parts[1].id,
    completedParts: parts.map((part) => part.id)
  });
});

test.after(async () => {
  if (subscription) await subscription.destroy().catch(() => {});
  if (story) {
    await ReadingProgress.destroy({ where: { storyId: story.id } }).catch(() => {});
    await StoryPart.destroy({ where: { storyId: story.id } }).catch(() => {});
    await story.destroy().catch(() => {});
  }
  if (collection) await collection.destroy().catch(() => {});
  for (const user of [reader, editor]) {
    if (!user) continue;
    await ReadingProgress.destroy({ where: { userId: user.id } }).catch(() => {});
    await user.destroy().catch(() => {});
  }
  if (plan) await plan.destroy().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  await sequelize.close().catch(() => {});
});

test('HTTP: une partie déjà terminée reste verrouillée sans abonnement actif', async () => {
  for (const partNumber of [1, 2]) {
    const response = await jsonFetch(`/stories/${story.slug}/parts/${partNumber}`, { token: readerToken });
    assert.equal(response.status, 403, `part ${partNumber}`);
    assert.equal(response.payload.code, 'SUBSCRIPTION_REQUIRED');
    assert.equal(response.payload.content, undefined);
    assert.equal(response.payload.blocks, undefined);
  }

  const complete = await jsonFetch(`/stories/${story.slug}/parts/1/complete`, {
    token: readerToken,
    method: 'POST'
  });
  assert.equal(complete.status, 403);
  assert.equal(complete.payload.code, 'SUBSCRIPTION_REQUIRED');
});

test('HTTP: la page histoire signale les parties payantes même déjà lues', async () => {
  const response = await jsonFetch(`/stories/${story.slug}`, { token: readerToken });
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.parts.map((part) => part.status), ['locked_subscription', 'locked_subscription']);
  assert.deepEqual(response.payload.parts.map((part) => part.accessible), [false, false]);
  assert.equal(response.payload.progress.completedCount, 0);
  assert.deepEqual(response.payload.progress.completedParts.sort(), parts.map((part) => part.id).sort());
});

test('HTTP: un visiteur et un éditeur restent traités comme avant', async () => {
  const guest = await jsonFetch(`/stories/${story.slug}/parts/1`);
  assert.equal(guest.status, 401);
  assert.equal(guest.payload.code, 'LOGIN_REQUIRED');

  const editorView = await jsonFetch(`/stories/${story.slug}/parts/2`, { token: editorToken });
  assert.equal(editorView.status, 200);
  assert.match(editorView.payload.content, /premium 2/i);
});

test('HTTP: un abonnement actif ouvre les parties, son expiration les reverrouille', async () => {
  subscription = await Subscription.create({
    userId: reader.id,
    planId: plan.id,
    status: 'active',
    startedAt: new Date()
  });

  const open = await jsonFetch(`/stories/${story.slug}/parts/2`, { token: readerToken });
  assert.equal(open.status, 200);
  assert.match(open.payload.content, /premium 2/i);

  const complete = await jsonFetch(`/stories/${story.slug}/parts/2/complete`, {
    token: readerToken,
    method: 'POST'
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.payload.alreadyCompleted, true);

  const detail = await jsonFetch(`/stories/${story.slug}`, { token: readerToken });
  assert.deepEqual(detail.payload.parts.map((part) => part.status), ['completed', 'completed']);
  assert.equal(detail.payload.progress.finished, true);

  // The same row with a passed end date no longer grants access.
  await subscription.update({ expiresAt: new Date(Date.now() - 60_000) });
  const expired = await jsonFetch(`/stories/${story.slug}/parts/1`, { token: readerToken });
  assert.equal(expired.status, 403);
  assert.equal(expired.payload.code, 'SUBSCRIPTION_REQUIRED');
});
