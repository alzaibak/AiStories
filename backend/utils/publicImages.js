const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC_DIRECTORY = process.env.PUBLIC_IMAGE_DIRECTORY ||
  path.join(__dirname, '..', 'public_uploads', 'covers');
const WIDTHS = [320, 640, 960, 1600];
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_BYTES = 5 * 1024 * 1024;

function publicBaseUrl() {
  return String(process.env.PUBLIC_MEDIA_BASE_URL || '').replace(/\/$/, '');
}

function imageUrl(fileName) {
  return `${publicBaseUrl()}/uploads/public/covers/${fileName}`;
}

async function ensurePublicDirectory() {
  await fs.promises.mkdir(PUBLIC_DIRECTORY, { recursive: true });
}

/**
 * Validates, strips metadata and derives responsive WebP variants plus a
 * blur-up placeholder. The uploaded original is never exposed: only the
 * normalised WebP derivatives are written to the public folder.
 */
async function processStoryImage(buffer, { kind = 'cover' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const error = new Error('Aucun fichier image reçu.');
    error.status = 422;
    error.code = 'INVALID_IMAGE';
    throw error;
  }
  if (buffer.length > MAX_BYTES) {
    const error = new Error('L’image dépasse 5 Mo.');
    error.status = 422;
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    const error = new Error('Le fichier envoyé n’est pas une image lisible.');
    error.status = 422;
    error.code = 'INVALID_IMAGE';
    throw error;
  }
  if (!ALLOWED_FORMATS.has(metadata.format)) {
    const error = new Error('Formats acceptés : JPG, PNG ou WebP.');
    error.status = 422;
    error.code = 'INVALID_IMAGE';
    throw error;
  }
  const minWidth = kind === 'hero' ? 1200 : 600;
  const minHeight = kind === 'hero' ? 600 : 600;
  if ((metadata.width || 0) < minWidth || (metadata.height || 0) < minHeight) {
    const error = new Error(`Dimensions minimales : ${minWidth} × ${minHeight} px.`);
    error.status = 422;
    error.code = 'IMAGE_TOO_SMALL';
    throw error;
  }

  await ensurePublicDirectory();
  const id = crypto.randomUUID();
  const pipeline = sharp(buffer).rotate();
  const variants = [];
  for (const width of WIDTHS) {
    const target = Math.min(width, metadata.width || width);
    const fileName = `${id}-${width}.webp`;
    await pipeline
      .clone()
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(PUBLIC_DIRECTORY, fileName));
    variants.push({ width: target, url: imageUrl(fileName) });
  }

  const placeholderBuffer = await pipeline
    .clone()
    .resize({ width: 24, blur: 1.4 })
    .webp({ quality: 45 })
    .toBuffer();

  let socialImage = null;
  if (kind === 'cover') {
    const socialName = `${id}-social.jpg`;
    await pipeline
      .clone()
      .resize({ width: 1200, height: 630, fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(PUBLIC_DIRECTORY, socialName));
    socialImage = imageUrl(socialName);
  }

  const largest = variants[variants.length - 1] || variants[0];
  return {
    url: largest.url,
    width: largest.width,
    height: Math.round((metadata.height || largest.width) * (largest.width / (metadata.width || largest.width))),
    variants,
    placeholder: `data:image/webp;base64,${placeholderBuffer.toString('base64')}`,
    socialImage,
    credit: ''
  };
}

module.exports = { processStoryImage, PUBLIC_DIRECTORY, MAX_BYTES };
