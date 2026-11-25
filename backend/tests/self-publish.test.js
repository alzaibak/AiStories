const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const audit = require('../utils/audit');
const emailQueue = require('../utils/emailQueue');
audit.recordAudit = async () => {};
emailQueue.enqueueTemplateEmails = async () => 0;

const { app } = require('../index');
const { Book, Collection, Story, StoryPart, StoryVideo, User } = require('../models');

function startServer(context) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  }).then((listening) => {
    context.after(() => new Promise((resolve, reject) => {
      listening.close((error) => error ? reject(error) : resolve());
    }));
    return listening;
  });
}

test('an admin can publish their own draft story without a second reviewer', async (context) => {
  const previousSecret = process.env.JWT_SECRET_KEY;
  process.env.JWT_SECRET_KEY = 'test-secret-for-self-publish';
  const originals = {
    userFindByPk: User.findByPk,
    userFindAll: User.findAll,
    storyFindByPk: Story.findByPk,
    storyFindOne: Story.findOne,
    collectionFindByPk: Collection.findByPk,
    collectionFindOne: Collection.findOne,
    bookFindOne: Book.findOne,
    parts: StoryPart.findAll
  };
  const author = {
    id: 8,
    role: 'ADMIN',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    tokenVersion: 0,
    language: 'fr',
    firstName: 'Admin',
    lastName: 'Unique'
  };
  const story = {
    id: 5,
    authorId: 8,
    status: 'draft',
    title: 'Histoire',
    summary: 'Résumé',
    collectionId: 2,
    slug: 'histoire-test',
    sourceReferences: [{ reference: 'source' }],
    reviewChecklist: {
      sourcesProvided: true,
      reviewedBy: 'Admin',
      reviewedAt: '2026-11-01',
      representationConfirmed: true
    },
    translations: { ar: { title: 'قصة' } },
    publishedAt: null,
    save: async () => {}
  };
  User.findByPk = async () => author;
  User.findAll = async () => [];
  Story.findByPk = async () => story;
  Story.findOne = async () => story;
  Collection.findByPk = async () => ({ id: 2 });
  Collection.findOne = async () => null;
  Book.findOne = async () => null;
  StoryPart.findAll = async () => [{ title: 'Partie', content: 'Contenu' }];

  const server = await startServer(context);
  context.after(() => {
    User.findByPk = originals.userFindByPk;
    User.findAll = originals.userFindAll;
    Story.findByPk = originals.storyFindByPk;
    Story.findOne = originals.storyFindOne;
    Collection.findByPk = originals.collectionFindByPk;
    Collection.findOne = originals.collectionFindOne;
    Book.findOne = originals.bookFindOne;
    StoryPart.findAll = originals.parts;
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
  });

  const token = jwt.sign({ id: 8, role: 'ADMIN', status: 'ACTIVE', aud: 'admin', tokenVersion: 0 }, process.env.JWT_SECRET_KEY);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/content/stories/5/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-language': 'fr' },
    body: '{}'
  });
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(story.status, 'published');
  assert.equal(story.reviewedBy, 8);
  assert.equal(story.reviewerId, 8);
});

test('an admin can approve their own draft video without a second reviewer', async (context) => {
  const previousSecret = process.env.JWT_SECRET_KEY;
  process.env.JWT_SECRET_KEY = 'test-secret-for-self-video-publish';
  const originalFindUser = User.findByPk;
  const originalFindVideo = StoryVideo.findByPk;
  const admin = {
    id: 8,
    role: 'ADMIN',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    tokenVersion: 0,
    language: 'fr'
  };
  const video = {
    id: 9,
    authorId: 8,
    status: 'draft',
    videoUrl: 'https://example.com/video',
    save: async () => {}
  };
  User.findByPk = async () => admin;
  StoryVideo.findByPk = async () => video;

  const server = await startServer(context);
  context.after(() => {
    User.findByPk = originalFindUser;
    StoryVideo.findByPk = originalFindVideo;
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
  });

  const token = jwt.sign({ id: 8, role: 'ADMIN', status: 'ACTIVE', aud: 'admin', tokenVersion: 0 }, process.env.JWT_SECRET_KEY);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/content/videos/9/review`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-language': 'fr' },
    body: JSON.stringify({ decision: 'approved', comments: '' })
  });
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(video.status, 'published');
  assert.equal(video.reviewedBy, 8);
});
