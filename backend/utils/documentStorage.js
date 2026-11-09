const { randomUUID } = require('crypto');
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
let client;

function storageConfigurationError() {
  const error = new Error('Le stockage privé S3 n’est pas configuré.');
  error.status = 503;
  return error;
}

function getStorage() {
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
  return { client, bucket };
}

function createDocumentKey(organizationId) {
  return `private-documents/${organizationId}/${randomUUID()}`;
}

function createUploadKey(organizationId) {
  return `private-document-uploads/${organizationId}/${randomUUID()}`;
}

function createMediaUploadKey() {
  return `private-story-media-uploads/${randomUUID()}`;
}

function createMediaKey() {
  return `private-story-media/${randomUUID()}`;
}

async function createUploadForm({ key, mimeType }) {
  const storage = getStorage();
  return createPresignedPost(storage.client, {
    Bucket: storage.bucket,
    Key: key,
    Expires: SIGNED_URL_TTL_SECONDS,
    Fields: { 'Content-Type': mimeType },
    Conditions: [['content-length-range', 1, MAX_DOCUMENT_BYTES]]
  });
}

async function createMediaUploadForm({ key, mimeType }) {
  return createUploadForm({ key, mimeType });
}

async function getDocumentMetadata(key) {
  const storage = getStorage();
  return storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }));
}

async function promoteUploadedDocument({ sourceKey, destinationKey, etag }) {
  const storage = getStorage();
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
  return storage.client.send(new CopyObjectCommand({
    Bucket: storage.bucket,
    Key: destinationKey,
    CopySource: `${storage.bucket}/${sourceKey}`,
    CopySourceIfMatch: etag,
    MetadataDirective: 'COPY'
  }));
}

async function deleteDocumentObject(key) {
  const storage = getStorage();
  return storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
}

async function createDownloadUrl({ key, fileName, mimeType }) {
  const storage = getStorage();
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
  return getSignedUrl(storage.client, new GetObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    ResponseContentDisposition: 'inline',
    ...(mimeType ? { ResponseContentType: mimeType } : {})
  }), { expiresIn: SIGNED_URL_TTL_SECONDS });
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
  createMediaUrl
};
