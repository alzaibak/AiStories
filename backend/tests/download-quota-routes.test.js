const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const downloads = require('../utils/bookDownloads');
const contentAccess = require('../utils/contentAccess');
const { SAMPLE_EBOOK_STORAGE_KEY } = require('../utils/sampleEbook');

let consumed = 0;
downloads.consumeDownload = async () => {
  if (consumed >= 1) return { allowed: false, unlimited: false, remaining: 0 };
  consumed += 1;
  return { allowed: true, unlimited: false, remaining: 0 };
};
contentAccess.canAccessBook = async () => true;

const { app } = require('../index');
const { getLocalStorageDirectory } = require('../utils/documentStorage');
const { Book, User } = require('../models');

const localPdfKey = 'local/quota-test-download.pdf';
const temporaryPdf = path.join(getLocalStorageDirectory(), 'quota-test-download.pdf');
fs.mkdirSync(path.dirname(temporaryPdf), { recursive: true });
fs.writeFileSync(temporaryPdf, '%PDF-1.4\nquota route test\n%%EOF\n');

test('local-download and sample-download consume the quota and reject a second attempt with 409', async (context) => {
  const previousSecret = process.env.JWT_SECRET_KEY;
  process.env.JWT_SECRET_KEY = 'test-secret-for-download-quota-routes';
  const originalFindUser = User.findByPk;
  const originalFindBook = Book.findOne;
  User.findByPk = async () => ({
    id: 42,
    role: 'READER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    tokenVersion: 0,
    mustChangePassword: false,
    language: 'fr'
  });
  Book.findOne = async ({ where }) => ({
    id: where.slug === 'sample-book' ? 502 : 501,
    slug: where.slug,
    format: 'ebook',
    status: 'published',
    fileStorageKey: where.slug === 'sample-book' ? SAMPLE_EBOOK_STORAGE_KEY : localPdfKey
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  context.after(async () => {
    User.findByPk = originalFindUser;
    Book.findOne = originalFindBook;
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
    fs.rmSync(temporaryPdf, { force: true });
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  const token = jwt.sign(
    { id: 42, role: 'READER', status: 'ACTIVE', tokenVersion: 0 },
    process.env.JWT_SECRET_KEY
  );
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/books`;
  const request = (slug, route) => fetch(`${baseUrl}/${slug}/${route}`, {
    headers: { authorization: `Bearer ${token}` }
  });

  consumed = 0;
  const firstLocal = await request('local-book', 'local-download');
  const firstLocalBody = await firstLocal.text();
  assert.equal(firstLocal.status, 200, firstLocalBody);
  const secondLocal = await request('local-book', 'local-download');
  assert.equal(secondLocal.status, 409);
  assert.equal((await secondLocal.json()).code, 'DOWNLOAD_LIMIT_REACHED');

  consumed = 0;
  const firstSample = await request('sample-book', 'sample-download');
  assert.equal(firstSample.status, 200);
  await firstSample.arrayBuffer();
  const secondSample = await request('sample-book', 'sample-download');
  assert.equal(secondSample.status, 409);
  assert.equal((await secondSample.json()).code, 'DOWNLOAD_LIMIT_REACHED');
});
