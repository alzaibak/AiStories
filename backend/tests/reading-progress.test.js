const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app } = require('../index');
const { User, ReadingProgress, Entitlement, Subscription } = require('../models');

function progressRow(story, completedParts) {
  return {
    story,
    completedParts,
    lastPartId: completedParts[completedParts.length - 1] || null,
    lastReadAt: new Date('2026-01-01T10:00:00Z'),
    toJSON() {
      return {
        id: story.id,
        storyId: story.id,
        completedParts: this.completedParts,
        lastPartId: this.lastPartId,
        lastReadAt: this.lastReadAt,
        story: this.story
      };
    }
  };
}

test('reading progress follows the reading order and returns no next part when complete', async (context) => {
  const previousSecret = process.env.JWT_SECRET_KEY;
  process.env.JWT_SECRET_KEY = 'test-secret-for-reading-progress';

  const originalFindUser = User.findByPk;
  const originalFindProgress = ReadingProgress.findAll;
  const originalFindEntitlements = Entitlement.findAll;
  const originalFindSubscriptions = Subscription.findAll;

  const completedStory = {
    id: 101,
    title: 'Completed part story',
    slug: 'completed-part-story',
    cover: null,
    isFree: true,
    collection: null,
    parts: [
      { id: 1011, partNumber: 1, isFree: true },
      { id: 1012, partNumber: 2, isFree: true },
      { id: 1013, partNumber: 3, isFree: true }
    ]
  };
  const lockedStory = {
    id: 202,
    title: 'Locked part story',
    slug: 'locked-part-story',
    cover: null,
    isFree: false,
    collection: { isFree: false },
    parts: [
      { id: 2021, partNumber: 1, isFree: true },
      { id: 2022, partNumber: 2, isFree: false },
      { id: 2023, partNumber: 3, isFree: true }
    ]
  };
  const finishedStory = {
    id: 303,
    title: 'Finished story',
    slug: 'finished-story',
    cover: null,
    isFree: true,
    collection: null,
    parts: [
      { id: 3031, partNumber: 1, isFree: true },
      { id: 3032, partNumber: 2, isFree: true }
    ]
  };

  User.findByPk = async () => ({
    id: 42,
    role: 'READER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    tokenVersion: 0,
    mustChangePassword: false,
    language: 'ar'
  });
  ReadingProgress.findAll = async () => [
    progressRow(completedStory, [1011]),
    progressRow(lockedStory, [2021]),
    progressRow(finishedStory, [3031, 3032])
  ];
  Entitlement.findAll = async () => [];
  Subscription.findAll = async () => [];

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  context.after(async () => {
    User.findByPk = originalFindUser;
    ReadingProgress.findAll = originalFindProgress;
    Entitlement.findAll = originalFindEntitlements;
    Subscription.findAll = originalFindSubscriptions;
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  const token = jwt.sign(
    { id: 42, role: 'READER', status: 'ACTIVE', tokenVersion: 0 },
    process.env.JWT_SECRET_KEY
  );
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/reading-progress`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.length, 3);

  const bySlug = Object.fromEntries(body.map((row) => [row.story.slug, row]));
  assert.deepEqual(bySlug['completed-part-story'].nextPart, { id: 1012, partNumber: 2 });
  // Strict order: part 3 stays out of reach while part 2 is not unlocked and read.
  assert.equal(bySlug['locked-part-story'].nextPart, null);
  assert.equal(bySlug['finished-story'].nextPart, null);
  assert.equal(bySlug['finished-story'].finished, true);
  assert.equal('parts' in bySlug['completed-part-story'].story, false);
});
