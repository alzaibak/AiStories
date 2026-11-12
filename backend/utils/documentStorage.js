const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 300;
const DEFAULT_LOCAL_DIRECTORY = path.join(__dirname, '..', 'private_uploads');
let client;

function storageConfigurationError() {
  const error = new Error('Private file storage is not configured.');
  error.status = 503;
  error.code = 'STORAGE_NOT_CONFIGURED';
  return error;
}

function getStorageDriver() {
  const configuredDriver = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (configuredDriver && !['local', 's3'].includes(configuredDriver)) {
    throw storageConfigurationError();
  }
  return configuredDriver || (process.env.NODE_ENV === 'production' ? 's3' : 'local');
}

function getMaxDocumentBytes() {
  const configuredLimit = process.env.STORAGE_MAX_UPLOAD_BYTES;
  if (!configuredLimit) return MAX_DOCUMENT_BYTES;
  const limit = Number(configuredLimit);
  if (!Number.isSafeInteger(limit) || limit < 1) throw storageConfigurationError();
  return limit;
}

function getLocalStorageDirectory() {
  return path.resolve(process.env.STORAGE_LOCAL_DIRECTORY || DEFAULT_LOCAL_DIRECTORY);
}

function getStorage() {
  const driver = getStorageDriver();
  if (driver === 'local') return { driver, directory: getLocalStorageDirectory() };

  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw storageConfigurationError();

  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw storageConfigurationError();

  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || Boolean(process.env.S3_ENDPOINT),
      ...(accessKeyId ? { credentials: { accessKeyId, secretAccessKey } } : {})
    });
  }
  return { driver, client, bucket };
}

function storageKeyPrefix(driver, prefix) {
  return `${driver === 'local' ? 'local/' : ''}${prefix}`;
}

function createDocumentKey(organizationId) {
  return `private-documents/${organizationId}/${randomUUID()}`;
}

function createUploadKey(organizationId) {
  return `private-document-uploads/${organizationId}/${randomUUID()}`;
}

function createMediaUploadKey() {
  return `${storageKeyPrefix(getStorageDriver(), 'private-story-media-uploads')}/${randomUUID()}`;
}

function createMediaKey() {
  return `${storageKeyPrefix(getStorageDriver(), 'private-story-media')}/${randomUUID()}`;
}

function isLocalStorageKey(key) {
  return typeof key === 'string' && key.startsWith('local/');
}

function localStoragePath(key) {
  if (!isLocalStorageKey(key)) throw storageConfigurationError();
  const root = getLocalStorageDirectory();
  const resolved = path.resolve(root, key.slice('local/'.length));
  const relative = path.relative(root, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw storageConfigurationError();
  }
  return resolved;
}

async function createUploadForm({ key, mimeType, localUploadUrl }) {
  const storage = getStorage();
  if (storage.driver === 'local') {
    if (!localUploadUrl) throw storageConfigurationError();
    return { driver: 'local', url: localUploadUrl, fields: {} };
  }
  return {
    driver: 's3',
    ...(await createPresignedPost(storage.client, {
      Bucket: storage.bucket,
      Key: key,
      Expires: SIGNED_URL_TTL_SECONDS,
      Fields: { 'Content-Type': mimeType },
      Conditions: [['content-length-range', 1, getMaxDocumentBytes()]]
    }))
  };
}

async function createMediaUploadForm({ key, mimeType, localUploadUrl }) {
  return createUploadForm({ key, mimeType, localUploadUrl });
}

async function promoteUploadedDocument({ sourceKey, destinationKey, etag }) {
  const storage = getStorage();
  if (isLocalStorageKey(sourceKey) && isLocalStorageKey(destinationKey)) {
    const destinationPath = localStoragePath(destinationKey);
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.promises.rename(localStoragePath(sourceKey), destinationPath);
    return;
  }
  return storage.client.send(new CopyObjectCommand({
    Bucket: storage.bucket,
    Key: destinationKey,
    CopySource: `${storage.bucket}/${sourceKey}`,
    CopySourceIfMatch: etag,
    MetadataDirective: 'COPY'
  }));
}

async function promoteUploadedMedia({ sourceKey, destinationKey, etag }) {
  const storage = getStorage();
  if (isLocalStorageKey(sourceKey) && isLocalStorageKey(destinationKey)) {
    const destinationPath = localStoragePath(destinationKey);
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.promises.rename(localStoragePath(sourceKey), destinationPath);
    return;
  }
  return storage.client.send(new CopyObjectCommand({
    Bucket: storage.bucket,
    Key: destinationKey,
    CopySource: `${storage.bucket}/${sourceKey}`,
    CopySourceIfMatch: etag,
    MetadataDirective: 'COPY'
  }));
}

async function deleteDocumentObject(key) {
  if (isLocalStorageKey(key)) {
    await fs.promises.rm(localStoragePath(key), { force: true });
    return;
  }
  const storage = getStorage();
  return storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
}

async function createDownloadUrl({ key, fileName, mimeType }) {
  const storage = getStorage();
  if (isLocalStorageKey(key)) throw storageConfigurationError();
  const safeName = fileName.replace(/[\r\n"]/g, '_').replace(/[^\x20-\x7E]/g, '_');
  return getSignedUrl(storage.client, new GetObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeName || 'document'}"`,
    ResponseContentType: mimeType
  }), { expiresIn: SIGNED_URL_TTL_SECONDS });
}

async function createMediaUrl({ key, mimeType }) {
  const storage = getStorage();
  if (isLocalStorageKey(key)) throw storageConfigurationError();
  return getSignedUrl(storage.client, new GetObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    ResponseContentDisposition: 'inline',
    ...(mimeType ? { ResponseContentType: mimeType } : {})
  }), { expiresIn: SIGNED_URL_TTL_SECONDS });
}

function getLocalUploadDirectory() {
  return path.join(getLocalStorageDirectory(), 'uploads');
}

async function ensureLocalStorageDirectories() {
  const root = getLocalStorageDirectory();
  await Promise.all([
    fs.promises.mkdir(getLocalUploadDirectory(), { recursive: true }),
    fs.promises.mkdir(path.join(root, 'private-story-media'), { recursive: true }),
    fs.promises.mkdir(path.join(root, 'private-story-media-uploads'), { recursive: true })
  ]);
}

function detectedMimeType(filePath) {
  const buffer = Buffer.alloc(12);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    return detectMimeType(buffer.subarray(0, bytesRead));
  } finally {
    fs.closeSync(descriptor);
  }
}

function mediaUploadMatches({ filePath, mimeType, mediaType }) {
  const detected = detectedMimeType(filePath);
  return detected === mimeType &&
    (mediaType === 'ebook' ? detected === 'application/pdf' : detected?.startsWith('image/'));
}

function detectMimeType(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function storeLocalUploadFile({ sourcePath, key }) {
  const destinationPath = localStoragePath(key);
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.promises.rename(sourcePath, destinationPath);
}

async function getDocumentMetadata(key) {
  const storage = getStorage();
  if (isLocalStorageKey(key)) {
    const filePath = localStoragePath(key);
    const stat = await fs.promises.stat(filePath);
    const detectedContentType = detectedMimeType(filePath);
    return {
      ContentLength: stat.size,
      ContentType: detectedContentType,
      DetectedContentType: detectedContentType,
      ETag: `"${stat.size}-${stat.mtimeMs}"`
    };
  }
  const metadata = await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }));
  if (Number(metadata.ContentLength) < 5) return { ...metadata, DetectedContentType: null };
  const response = await storage.client.send(new GetObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    Range: 'bytes=0-11'
  }));
  const signature = Buffer.from(await response.Body.transformToByteArray());
  return { ...metadata, DetectedContentType: detectMimeType(signature) };
}

module.exports = {
  MAX_DOCUMENT_BYTES,
  SIGNED_URL_TTL_SECONDS,
  createDocumentKey,
  createUploadKey,
  createMediaUploadKey,
  createMediaKey,
  createUploadForm,
  createMediaUploadForm,
  getDocumentMetadata,
  promoteUploadedDocument,
  promoteUploadedMedia,
  deleteDocumentObject,
  createDownloadUrl,
  createMediaUrl,
  getStorageDriver,
  getMaxDocumentBytes,
  getLocalStorageDirectory,
  getLocalUploadDirectory,
  ensureLocalStorageDirectories,
  storeLocalUploadFile,
  localStoragePath,
  detectedMimeType,
  mediaUploadMatches,
  detectMimeType,
  isLocalStorageKey
};
