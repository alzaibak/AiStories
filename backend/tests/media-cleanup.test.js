const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { Op } = require('sequelize');
const { collectPublicAssetIds, createMediaCleanup } = require('../utils/mediaCleanup');

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const ownStory = '33333333-3333-4333-8333-333333333333';
const collectionBanner = '44444444-4444-4444-8444-444444444444';
const sharedVariant = '55555555-5555-4555-8555-555555555555';
const mediaAssetUrl = '66666666-6666-4666-8666-666666666666';
const ownBook = '77777777-7777-4777-8777-777777777777';
const sharedBook = '88888888-8888-4888-8888-888888888888';

function valueMatches(actual, condition) {
  if (condition && typeof condition === 'object') {
    if (Object.prototype.hasOwnProperty.call(condition, Op.like)) {
      const needle = String(condition[Op.like]).replaceAll('%', '').toLowerCase();
      return JSON.stringify(actual ?? '').toLowerCase().includes(needle);
    }
    if (Object.prototype.hasOwnProperty.call(condition, Op.in)) {
      return condition[Op.in].includes(actual);
    }
  }
  return actual === condition;
}

function rowMatches(row, where) {
  if (!where) return true;
  if (where[Op.or]) return where[Op.or].some((clause) => rowMatches(row, clause));
  return Object.entries(where).every(([field, condition]) => valueMatches(row[field], condition));
}

function fakeModel(rows = []) {
  return {
    rows,
    async count({ where } = {}) {
      return rows.filter((row) => rowMatches(row, where)).length;
    },
    async findAll({ where } = {}) {
      return rows.filter((row) => rowMatches(row, where));
    },
    async findOne({ where } = {}) {
      return rows.find((row) => rowMatches(row, where)) || null;
    },
    async destroy({ where } = {}) {
      const before = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rowMatches(rows[index], where)) rows.splice(index, 1);
      }
      return before - rows.length;
    }
  };
}

function fakeRecord(row, rows) {
  return {
    ...row,
    async destroy() {
      const index = rows.findIndex((candidate) => candidate.id === row.id);
      if (index >= 0) rows.splice(index, 1);
    }
  };
}

function fakeFileSystem(fileNames) {
  const remaining = new Set(fileNames);
  return {
    remaining,
    promises: {
      async readdir() {
        return [...remaining];
      },
      async rm(target) {
        remaining.delete(path.basename(target));
      }
    }
  };
}

function cleanupFor({ models, fileSystem }) {
  return createMediaCleanup({
    models,
    fileSystem,
    publicDirectory: '/fake/public/covers',
    deleteDocumentObject: async () => {},
    logger: { warn() {} }
  });
}

test('public asset cleanup tracks every variant of an uploaded image once', () => {
  const ids = collectPublicAssetIds([
    `https://cdn.example.test/uploads/public/covers/${first}-1600.webp?cache=1`,
    `https://cdn.example.test/uploads/public/covers/${first}-640.webp`,
    `https://cdn.example.test/uploads/public/covers/${first}-social.jpg`,
    [{ url: `https://cdn.example.test/uploads/public/covers/${second}-960.webp` }],
    'https://images.example.test/external-cover.jpg',
    '/uploads/public/covers/not-a-uuid.webp',
    null
  ]);
  assert.deepEqual([...ids].sort(), [first, second]);
});

test('non-string and empty values are ignored', () => {
  assert.equal(collectPublicAssetIds([null, undefined, 42, {}, []]).size, 0);
});

test('collection snapshots include the uploaded banner', async () => {
  const cleanup = cleanupFor({ models: {}, fileSystem: fakeFileSystem([]) });
  const snapshot = await cleanup.snapshotCollection({
    id: 9,
    cover: null,
    coverImage: null,
    bannerImage: `/uploads/public/covers/${collectionBanner}-1600.webp`
  });
  assert.deepEqual([...snapshot.publicIds], [collectionBanner]);
});

test('deleting a story removes exclusive variants but keeps banner, cover-variant, and MediaAsset references', async () => {
  const storyRows = [
    {
      id: 11,
      cover: `/uploads/public/covers/${ownStory}-1600.webp`,
      coverImage: null,
      heroImage: `/uploads/public/covers/${collectionBanner}-1600.webp`,
      socialImage: `/uploads/public/covers/${mediaAssetUrl}-640.webp`,
      coverVariants: JSON.stringify([
        { width: 640, url: `/uploads/public/covers/${ownStory}-640.webp` },
        { width: 960, url: `/uploads/public/covers/${sharedVariant}-960.webp` }
      ])
    },
    {
      id: 12,
      coverVariants: JSON.stringify([
        { width: 320, url: `/uploads/public/covers/${sharedVariant}-320.webp` }
      ])
    }
  ];
  const collectionRows = [{
    id: 21,
    cover: null,
    coverImage: null,
    bannerImage: `/uploads/public/covers/${collectionBanner}-640.webp`
  }];
  const mediaAssetRows = [{
    id: 31,
    storyId: 99,
    externalUrl: `https://cdn.example.test/uploads/public/covers/${mediaAssetUrl}-960.webp`
  }];
  const models = {
    Story: fakeModel(storyRows),
    StoryPart: fakeModel([]),
    Book: fakeModel([]),
    Collection: fakeModel(collectionRows),
    MediaAsset: fakeModel(mediaAssetRows)
  };
  const fileSystem = fakeFileSystem([
    `${ownStory}-1600.webp`,
    `${ownStory}-640.webp`,
    `${collectionBanner}-1600.webp`,
    `${collectionBanner}-640.webp`,
    `${sharedVariant}-960.webp`,
    `${sharedVariant}-320.webp`,
    `${mediaAssetUrl}-640.webp`,
    `${mediaAssetUrl}-960.webp`
  ]);
  const cleanup = cleanupFor({ models, fileSystem });
  const story = fakeRecord(storyRows[0], storyRows);

  await cleanup.deleteStoryWithMedia(story);

  assert.deepEqual([...fileSystem.remaining].sort(), [
    `${collectionBanner}-1600.webp`,
    `${collectionBanner}-640.webp`,
    `${mediaAssetUrl}-640.webp`,
    `${mediaAssetUrl}-960.webp`,
    `${sharedVariant}-320.webp`,
    `${sharedVariant}-960.webp`
  ].sort());
  assert.equal(storyRows.some((row) => row.id === 11), false);
});

test('deleting a book removes its exclusive cover but keeps a cover used by another book', async () => {
  const bookRows = [
    { id: 41, cover: `/uploads/public/covers/${ownBook}-1600.webp` },
    { id: 42, cover: `/uploads/public/covers/${sharedBook}-1600.webp` }
  ];
  const models = {
    Story: fakeModel([]),
    StoryPart: fakeModel([]),
    Book: fakeModel(bookRows),
    Collection: fakeModel([]),
    MediaAsset: fakeModel([])
  };
  const fileSystem = fakeFileSystem([
    `${ownBook}-1600.webp`,
    `${sharedBook}-1600.webp`
  ]);
  const cleanup = cleanupFor({ models, fileSystem });
  const book = fakeRecord(bookRows[0], bookRows);

  await cleanup.deleteBookWithMedia(book);

  assert.deepEqual([...fileSystem.remaining], [`${sharedBook}-1600.webp`]);
  assert.equal(bookRows.some((row) => row.id === 41), false);
});
