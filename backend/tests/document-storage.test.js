const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createUploadForm,
  createMediaUploadForm,
  createMediaUploadKey,
  createMediaKey,
  getDocumentMetadata,
  promoteUploadedMedia,
  deleteDocumentObject,
  mediaUploadMatches,
  MAX_DOCUMENT_BYTES
} = require('../utils/documentStorage');

test('le stockage refuse une configuration incomplète et signe une limite de 20 Mo', async () => {
  const environmentKeys = [
    'S3_BUCKET',
    'S3_REGION',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_FORCE_PATH_STYLE',
    'STORAGE_DRIVER',
    'STORAGE_LOCAL_DIRECTORY',
    'STORAGE_MAX_UPLOAD_BYTES'
  ];
  const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));

  try {
    for (const key of environmentKeys) delete process.env[key];
    process.env.STORAGE_DRIVER = 's3';
    await assert.rejects(
      createUploadForm({ key: 'private-document-uploads/1/test', mimeType: 'application/pdf' }),
      (error) => error.status === 503
    );

    process.env.S3_BUCKET = 'meditender-test';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY_ID = 'test-access-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
    const upload = await createUploadForm({
      key: 'private-document-uploads/1/test',
      mimeType: 'application/pdf'
    });
    const policy = JSON.parse(Buffer.from(upload.fields.Policy, 'base64').toString('utf8'));

    assert.ok(policy.conditions.some((condition) =>
      Array.isArray(condition) &&
      condition[0] === 'content-length-range' &&
      condition[1] === 1 &&
      condition[2] === MAX_DOCUMENT_BYTES
    ));
    assert.equal(upload.fields['Content-Type'], 'application/pdf');
  } finally {
    for (const key of environmentKeys) {
      if (previousEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnvironment[key];
    }
  }
});

test('le stockage local privé crée des uploads de taille limitée et finalise les fichiers', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'story-private-storage-'));
  const environmentKeys = ['STORAGE_DRIVER', 'STORAGE_LOCAL_DIRECTORY', 'STORAGE_MAX_UPLOAD_BYTES'];
  const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));

  try {
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_DIRECTORY = directory;
    delete process.env.STORAGE_MAX_UPLOAD_BYTES;
    const uploadKey = createMediaUploadKey();
    const mediaKey = createMediaKey();
    const upload = await createMediaUploadForm({
      key: uploadKey,
      mimeType: 'application/pdf',
      localUploadUrl: '/admin/content/media/5/upload'
    });
    assert.deepEqual(upload, {
      driver: 'local',
      url: '/admin/content/media/5/upload',
      fields: {}
    });

    const sourcePath = path.join(directory, 'pending-upload');
    await fs.writeFile(sourcePath, Buffer.from('%PDF-1.7\nprivate test'));
    const { storeLocalUploadFile } = require('../utils/documentStorage');
    assert.equal(mediaUploadMatches({
      filePath: sourcePath,
      mimeType: 'application/pdf',
      mediaType: 'ebook'
    }), true);
    assert.equal(mediaUploadMatches({
      filePath: sourcePath,
      mimeType: 'image/png',
      mediaType: 'cover'
    }), false);
    await storeLocalUploadFile({ sourcePath, key: uploadKey });
    const metadata = await getDocumentMetadata(uploadKey);
    assert.equal(metadata.ContentType, 'application/pdf');
    assert.equal(metadata.DetectedContentType, 'application/pdf');
    assert.equal(metadata.ContentLength, Buffer.byteLength('%PDF-1.7\nprivate test'));

    await promoteUploadedMedia({ sourceKey: uploadKey, destinationKey: mediaKey });
    assert.equal((await fs.readFile(path.join(directory, mediaKey.slice('local/'.length)))).toString(), '%PDF-1.7\nprivate test');
    await deleteDocumentObject(mediaKey);
    await assert.rejects(fs.stat(path.join(directory, mediaKey.slice('local/'.length))));
  } finally {
    for (const key of environmentKeys) {
      if (previousEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnvironment[key];
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('la validation de fichier refuse un texte ou une fausse extension présentés comme PDF', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'story-upload-validation-'));
  const fakePdfPath = path.join(directory, 'misleading.pdf');
  try {
    await fs.writeFile(fakePdfPath, '<html>not a PDF</html>');
    assert.equal(mediaUploadMatches({
      filePath: fakePdfPath,
      mimeType: 'application/pdf',
      mediaType: 'ebook'
    }), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
