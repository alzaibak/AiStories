const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-part-blocks-'));
process.env.PUBLIC_IMAGE_DIRECTORY = directory;
process.env.PUBLIC_MEDIA_BASE_URL = '';

const schemas = require('../middleware/storyValidation');
const { processStoryImage } = require('../utils/publicImages');
const {
  sanitizeBlocks,
  textFromBlocks,
  localizeBlocks,
  fallbackBlocks,
  blockImageUrls
} = require('../utils/partBlocks');

after(() => {
  try {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // Windows may briefly lock generated files; the temp folder is disposable.
  }
});

const image = {
  url: '/uploads/public/covers/2b1e4a60-1111-4222-8333-944455556666-1200.webp',
  thumbUrl: '/uploads/public/covers/2b1e4a60-1111-4222-8333-944455556666-600.webp',
  width: 1200,
  height: 800
};

const basePart = {
  partNumber: 1,
  title: 'الجزء الأول',
  endingHook: 'ماذا لو...؟'
};

test('a part accepts ordered text, image and quote blocks', () => {
  const result = schemas.partSchema.safeParse({
    ...basePart,
    blocks: [
      { type: 'text', text: { ar: 'الفقرة الأولى' } },
      { type: 'image', image, alt: { ar: 'سفينة' }, caption: { ar: 'غلاف' }, layout: 'wide' },
      { type: 'quote', text: { ar: 'إن الله معنا' }, reference: { ar: 'التوبة: 40' } }
    ]
  });
  assert.equal(result.success, true);
  assert.equal(result.data.blocks.length, 3);
  assert.equal(result.data.content, '');
});

test('text and quote blocks require the Arabic text', () => {
  for (const block of [{ type: 'text', text: { en: 'English only' } }, { type: 'quote', text: {} }]) {
    const result = schemas.partSchema.safeParse({ ...basePart, blocks: [block] });
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error.issues), /arabe/i);
  }
});

test('image blocks need an image and an alt text unless decorative', () => {
  const missingImage = schemas.partSchema.safeParse({
    ...basePart,
    blocks: [{ type: 'image', alt: { ar: 'سفينة' } }]
  });
  assert.equal(missingImage.success, false);

  const missingAlt = schemas.partSchema.safeParse({
    ...basePart,
    blocks: [{ type: 'image', image }]
  });
  assert.equal(missingAlt.success, false);
  assert.match(JSON.stringify(missingAlt.error.issues), /alternatif/i);

  const decorative = schemas.partSchema.safeParse({
    ...basePart,
    blocks: [{ type: 'image', image, decorative: true }]
  });
  assert.equal(decorative.success, true);
});

test('a part is capped at 40 blocks and 12 images', () => {
  const manyBlocks = Array.from({ length: 41 }, () => ({ type: 'text', text: { ar: 'نص' } }));
  assert.equal(schemas.partSchema.safeParse({ ...basePart, blocks: manyBlocks }).success, false);

  const manyImages = Array.from({ length: 13 }, () => ({ type: 'image', image, alt: { ar: 'صورة' } }));
  const result = schemas.partSchema.safeParse({ ...basePart, blocks: manyImages });
  assert.equal(result.success, false);
  assert.match(JSON.stringify(result.error.issues), /12 images/);
});

test('sanitising renumbers positions and drops empty blocks', () => {
  const cleaned = sanitizeBlocks([
    { type: 'text', text: { ar: 'أول' } },
    { type: 'text', text: { ar: '  ' } },
    { type: 'image', image, alt: { ar: 'صورة' }, layout: 'weird' }
  ]);
  assert.equal(cleaned.length, 2);
  assert.deepEqual(cleaned.map((block) => block.position), [1, 2]);
  assert.equal(cleaned[1].layout, 'full');
  assert.equal(cleaned[0].type, 'text');
});

test('plain content is derived from the Arabic text blocks', () => {
  const content = textFromBlocks([
    { type: 'text', text: { ar: 'الفقرة الأولى', en: 'First' } },
    { type: 'image', image, alt: { ar: 'صورة' } },
    { type: 'text', text: { ar: 'الفقرة الثانية' } }
  ]);
  assert.equal(content, 'الفقرة الأولى\n\nالفقرة الثانية');
});

test('blocks are localised with an Arabic fallback, images stay shared', () => {
  const rows = [
    { id: 1, position: 1, type: 'image', image, alt: { ar: 'سفينة' }, caption: { en: 'A ship' }, layout: 'full' },
    { id: 2, position: 2, type: 'text', text: { ar: 'نص', fr: 'Texte' } }
  ];
  const french = localizeBlocks(rows, 'fr');
  assert.equal(french[0].alt, 'سفينة');
  assert.equal(french[0].caption, 'A ship');
  assert.equal(french[0].image.url, image.url);
  assert.equal(french[1].text, 'Texte');
});

test('a part without blocks falls back to its legacy content', () => {
  const blocks = fallbackBlocks({ id: 7, content: 'الفقرة الأولى\n\nالفقرة الثانية' });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'text');
  assert.match(blocks[0].text, /الفقرة الثانية/);
  assert.deepEqual(fallbackBlocks({ id: 8, content: '   ' }), []);
});

test('block image files are collected for cleanup', () => {
  assert.deepEqual(blockImageUrls({ image }), [image.url, image.thumbUrl]);
  assert.deepEqual(blockImageUrls({ image: null }), []);
});

test('an in-story image is converted to two WebP sizes without metadata', async () => {
  const buffer = await sharp({
    create: { width: 1400, height: 900, channels: 3, background: '#0d3a2c' }
  }).png().toBuffer();
  const result = await processStoryImage(buffer, { kind: 'block' });
  assert.deepEqual(result.variants.map((variant) => variant.width), [600, 1200]);
  assert.equal(result.socialImage, null);
  assert.equal(result.width, 1200);
  assert.equal(result.height, 771);
  for (const variant of result.variants) {
    const fileName = variant.url.split('/').pop();
    const metadata = await sharp(path.join(directory, fileName)).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.exif, undefined);
  }
});

test('a text file renamed .jpg is refused', async () => {
  await assert.rejects(
    () => processStoryImage(Buffer.from('this is not an image'), { kind: 'block' }),
    (error) => error.code === 'INVALID_IMAGE'
  );
});

test('an image above 8 MB is refused before conversion', async () => {
  const buffer = Buffer.alloc(9 * 1024 * 1024, 1);
  await assert.rejects(
    () => processStoryImage(buffer, { kind: 'block' }),
    (error) => error.code === 'IMAGE_TOO_LARGE' && /8 Mo/.test(error.message)
  );
});
