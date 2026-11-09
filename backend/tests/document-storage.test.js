const test = require('node:test');
const assert = require('node:assert/strict');
const { createUploadForm, MAX_DOCUMENT_BYTES } = require('../utils/documentStorage');

test('le stockage refuse une configuration incomplète et signe une limite de 20 Mo', async () => {
  const environmentKeys = [
    'S3_BUCKET',
    'S3_REGION',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_FORCE_PATH_STYLE'
  ];
  const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));

  try {
    for (const key of environmentKeys) delete process.env[key];
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
