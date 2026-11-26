const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const defaultModels = require('../models');
const { deleteDocumentObject: defaultDeleteDocumentObject } = require('./documentStorage');
const { PUBLIC_DIRECTORY: DEFAULT_PUBLIC_DIRECTORY } = require('./publicImages');
const { SAMPLE_EBOOK_STORAGE_KEY } = require('./sampleEbook');

const PUBLIC_ASSET_PATTERN = /\/uploads\/public\/covers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-[^/?#]*)?\.(?:webp|jpe?g|png)/i;

/**
 * Every model field that can contain a public `/uploads/public/covers/...`
 * URL. Keep this list in sync with the models: a missed field lets cleanup
 * delete an image that another record still uses.
 */
const PUBLIC_REFERENCE_FIELDS = {
  User: ['avatarUrl'],
  Category: ['image'],
  Collection: ['cover', 'coverImage', 'bannerImage'],
  Story: ['cover', 'coverImage', 'heroImage', 'socialImage', 'coverVariants'],
  StoryPart: ['illustrationImage'],
  StoryPartBlock: ['image'],
  StoryVideo: ['thumbnail', 'videoUrl'],
  Book: ['cover'],
  MediaAsset: ['externalUrl'],
  StyleGuide: ['referenceImages'],
  BadgeType: ['imageUrl'],
  MysteryBoxItem: ['imageUrl'],
  MysteryBoxAppearance: ['bannerImage'],
  DonationCampaign: ['coverImage', 'bannerImage'],
  DistributionPlace: ['images'],
  CampaignUpdate: ['images'],
  ReturnRequest: ['photos'],
  Tender: ['attachmentUrls', 'voiceRecordingUrl'],
  Document: ['fileUrl'],
  Product: ['rcpUrl']
};

function collectPublicAssetIds(value, ids = new Set()) {
  if (typeof value === 'string') {
    const match = value.match(PUBLIC_ASSET_PATTERN);
    if (match) ids.add(match[1].toLowerCase());
    return ids;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectPublicAssetIds(entry, ids);
    return ids;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectPublicAssetIds(entry, ids);
  }
  return ids;
}

function parseVariants(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isDeletableDocumentKey(key) {
  // Built-in content lives with the application, never in uploaded storage.
  return Boolean(key) && !String(key).startsWith('builtin:');
}

/**
 * Build the cleanup service with injectable storage and models. The default
 * instance is exported for routes; the factory is the seam used by tests.
 */
function createMediaCleanup({
  models = defaultModels,
  fileSystem = fs,
  publicDirectory = DEFAULT_PUBLIC_DIRECTORY,
  deleteDocumentObject = defaultDeleteDocumentObject,
  logger = console
} = {}) {
  const {
    Book,
    Collection,
    MediaAsset,
    MysteryBoxAppearance,
    MysteryBoxItem,
    StoryPart,
    StoryPartBlock
  } = models;

  function report(context, error) {
    logger.warn(`[media-cleanup] ${context}:`, error?.message || error);
  }

  async function mediaAssetsFor({ storyId, partIds = [], bookId }) {
    if (!MediaAsset) return [];
    const where = [];
    if (storyId) where.push({ storyId });
    if (partIds.length) where.push({ partId: { [Op.in]: partIds } });
    if (bookId) where.push({ bookId });
    if (!where.length) return [];
    return MediaAsset.findAll({ where: { [Op.or]: where } });
  }

  function documentKeysFrom(assets) {
    return [...new Set(assets.map((asset) => asset.storageKey).filter(isDeletableDocumentKey))];
  }

  async function snapshotStory(story) {
    const parts = StoryPart
      ? await StoryPart.findAll({
        where: { storyId: story.id },
        attributes: ['id', 'illustrationImage']
      })
      : [];
    const blocks = StoryPartBlock && parts.length
      ? await StoryPartBlock.findAll({
        where: { partId: { [Op.in]: parts.map((part) => part.id) } },
        attributes: ['id', 'image']
      })
      : [];
    const assets = await mediaAssetsFor({ storyId: story.id, partIds: parts.map((part) => part.id) });
    const publicIds = collectPublicAssetIds([
      story.cover,
      story.coverImage,
      story.heroImage,
      story.socialImage,
      parseVariants(story.coverVariants),
      parts.map((part) => part.illustrationImage),
      blocks.map((block) => block.image)
    ]);
    return {
      label: `story ${story.id}`,
      publicIds,
      documentKeys: documentKeysFrom(assets),
      mediaAssetIds: assets.map((asset) => asset.id)
    };
  }

  async function snapshotBook(book) {
    const assets = await mediaAssetsFor({ bookId: book.id });
    const publicIds = collectPublicAssetIds(book.cover);
    return {
      label: `book ${book.id}`,
      publicIds,
      // The private ebook file follows the book. Any MediaAsset holding the same
      // key is checked again at purge time before the file is removed.
      documentKeys: [...new Set([
        ...documentKeysFrom(assets),
        ...(book.fileStorageKey === SAMPLE_EBOOK_STORAGE_KEY ? [] : [book.fileStorageKey].filter(isDeletableDocumentKey))
      ])],
      mediaAssetIds: assets.map((asset) => asset.id)
    };
  }

  async function snapshotMysteryBox(box) {
    const [appearance, items] = await Promise.all([
      MysteryBoxAppearance ? MysteryBoxAppearance.findOne({ where: { boxId: box.id } }) : null,
      MysteryBoxItem
        ? MysteryBoxItem.findAll({ where: { boxId: box.id }, attributes: ['id', 'imageUrl'] })
        : []
    ]);
    return {
      label: `mystery box ${box.id}`,
      publicIds: collectPublicAssetIds([
        appearance?.bannerImage,
        items.map((item) => item.imageUrl)
      ]),
      documentKeys: [],
      mediaAssetIds: []
    };
  }

  async function snapshotCollection(collection) {
    return {
      label: `collection ${collection.id}`,
      publicIds: collectPublicAssetIds([
        collection.cover,
        collection.coverImage,
        collection.bannerImage
      ]),
      documentKeys: [],
      mediaAssetIds: []
    };
  }

  /** Counts every remaining database reference to a derived public asset. */
  async function publicAssetReferenceCount(id) {
    const like = `%${id}%`;
    const checks = [];
    for (const [modelName, fields] of Object.entries(PUBLIC_REFERENCE_FIELDS)) {
      const Model = models[modelName];
      if (!Model) continue;
      checks.push(Model.count({
        where: {
          [Op.or]: fields.map((field) => ({ [field]: { [Op.like]: like } }))
        }
      }));
    }
    const counts = await Promise.all(checks);
    return counts.reduce((total, count) => total + count, 0);
  }

  async function removePublicAssets(ids) {
    if (!ids.size) return;
    let fileNames;
    try {
      fileNames = await fileSystem.promises.readdir(publicDirectory);
    } catch (error) {
      if (error.code !== 'ENOENT') report('read public directory', error);
      return;
    }
    for (const id of ids) {
      let references = 0;
      try {
        references = await publicAssetReferenceCount(id);
      } catch (error) {
        // Never delete a file when we cannot prove it is unreferenced.
        report(`check references for ${id}`, error);
        continue;
      }
      if (references > 0) continue;
      const owned = fileNames.filter((fileName) => (
        fileName.toLowerCase().startsWith(`${id}-`) || fileName.toLowerCase().startsWith(`${id}.`)
      ));
      for (const fileName of owned) {
        try {
          await fileSystem.promises.rm(path.join(publicDirectory, fileName), { force: true });
        } catch (error) {
          report(`remove ${fileName}`, error);
        }
      }
    }
  }

  async function documentKeyReferenceCount(key) {
    const [mediaCount, bookCount] = await Promise.all([
      MediaAsset ? MediaAsset.count({ where: { storageKey: key } }) : 0,
      Book ? Book.count({ where: { fileStorageKey: key } }) : 0
    ]);
    return mediaCount + bookCount;
  }

  async function removeDocumentObjects(keys) {
    for (const key of keys) {
      try {
        const references = await documentKeyReferenceCount(key);
        if (references > 0) continue;
        await deleteDocumentObject(key);
      } catch (error) {
        report(`remove document ${key}`, error);
      }
    }
  }

  /**
   * Removes the files and media rows owned by an already deleted parent record.
   * Reference checks run after the parent is gone, so shared covers survive.
   * Storage failures are logged but never fail the admin deletion.
   */
  async function purgeSnapshot(snapshot) {
    if (!snapshot) return;
    try {
      if (snapshot.mediaAssetIds?.length && MediaAsset) {
        // MediaAsset rows cascade with the story/book; this also covers databases
        // where the foreign key cascade is not enforced.
        await MediaAsset.destroy({ where: { id: { [Op.in]: snapshot.mediaAssetIds } } });
      }
    } catch (error) {
      report(`media rows (${snapshot.label})`, error);
    }
    try {
      await removePublicAssets(snapshot.publicIds || new Set());
    } catch (error) {
      report(`public assets (${snapshot.label})`, error);
    }
    try {
      await removeDocumentObjects(snapshot.documentKeys || []);
    } catch (error) {
      report(`documents (${snapshot.label})`, error);
    }
  }

  async function deleteStoryWithMedia(story) {
    const snapshot = await snapshotStory(story);
    await story.destroy();
    await purgeSnapshot(snapshot);
  }

  async function deleteBookWithMedia(book) {
    const snapshot = await snapshotBook(book);
    await book.destroy();
    await purgeSnapshot(snapshot);
  }

  async function deleteMysteryBoxWithMedia(box) {
    const snapshot = await snapshotMysteryBox(box);
    await box.destroy();
    await purgeSnapshot(snapshot);
  }

  async function deleteCollectionWithMedia(collection) {
    const snapshot = await snapshotCollection(collection);
    await collection.destroy();
    await purgeSnapshot(snapshot);
  }

  return {
    collectPublicAssetIds,
    publicAssetReferenceCount,
    snapshotStory,
    snapshotBook,
    snapshotMysteryBox,
    snapshotCollection,
    removePublicAssets,
    purgeSnapshot,
    deleteStoryWithMedia,
    deleteBookWithMedia,
    deleteMysteryBoxWithMedia,
    deleteCollectionWithMedia
  };
}

const cleanup = createMediaCleanup();

module.exports = {
  ...cleanup,
  createMediaCleanup,
  PUBLIC_REFERENCE_FIELDS,
  PUBLIC_ASSET_PATTERN
};
