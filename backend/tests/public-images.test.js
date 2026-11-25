const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stories-covers-'));
process.env.PUBLIC_IMAGE_DIRECTORY = directory;
process.env.PUBLIC_MEDIA_BASE_URL = 'https://cdn.example.test';

const { processStoryImage } = require('../utils/publicImages');

after(() => {
  try {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // Windows may briefly lock generated files; the temp folder is disposable.
  }
});

test('cover upload generates responsive WebP variants, a blur placeholder and a social image', async () => {
  const buffer = await sharp({
    create: { width: 1200, height: 1600, channels: 3, background: '#0d3a2c' }
  }).png().toBuffer();
  const result = await processStoryImage(buffer, { kind: 'cover' });
  assert.equal(result.variants.length, 4);
  assert.deepEqual(result.variants.map((variant) => variant.width), [320, 640, 960, 1200]);
  for (const variant of result.variants) {
    assert.ok(variant.url.startsWith('https://cdn.example.test/uploads/public/covers/'));
    const fileName = variant.url.split('/').pop();
    const metadata = await sharp(path.join(directory, fileName)).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, variant.width);
    assert.equal(metadata.exif, undefined);
  }
  assert.match(result.placeholder, /^data:image\/webp;base64,/);
  assert.ok(result.socialImage.endsWith('-social.jpg'));
  assert.ok(fs.existsSync(path.join(directory, result.socialImage.split('/').pop())));
});

test('rejects unreadable files and images below the minimum dimensions', async () => {
  await assert.rejects(
    () => processStoryImage(Buffer.from('not an image')),
    (error) => error.code === 'INVALID_IMAGE'
  );
  const tiny = await sharp({
    create: { width: 120, height: 120, channels: 3, background: '#ffffff' }
  }).jpeg().toBuffer();
  await assert.rejects(
    () => processStoryImage(tiny),
    (error) => error.code === 'IMAGE_TOO_SMALL' && /600/.test(error.message)
  );
});
