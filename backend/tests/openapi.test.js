const test = require('node:test');
const assert = require('node:assert/strict');
const openApiDocument = require('../openapi');

test('la documentation OpenAPI décrit chaque opération active de l’API', () => {
  const operationCount = Object.values(openApiDocument.paths)
    .reduce((count, path) => count + Object.keys(path).length, 0);

  assert.equal(openApiDocument.openapi, '3.0.3');
  assert.equal(operationCount, 67);
  assert.ok(openApiDocument.paths['/seller/tenders']);
  assert.ok(openApiDocument.paths['/seller/auth/register/request-code']);
  assert.ok(openApiDocument.paths['/auth/password/request-code']);
  assert.ok(openApiDocument.paths['/auth/password/verify-code']);
  assert.ok(openApiDocument.paths['/auth/password/reset']);
  assert.deepEqual(openApiDocument.paths['/auth/password/request-code'].post.security, []);
  assert.deepEqual(openApiDocument.paths['/auth/password/verify-code'].post.security, []);
  assert.deepEqual(openApiDocument.paths['/auth/password/reset'].post.security, []);
  assert.ok(openApiDocument.paths['/buyer/auth/register/verify-code']);
  assert.ok(openApiDocument.paths['/admin/auth/verify-code']);
  assert.ok(openApiDocument.paths['/tenders/{id}/publish']);
  assert.ok(openApiDocument.paths['/offers/{id}/submit']);
  assert.ok(openApiDocument.paths['/collaboration/offers/{offerId}/messages']);
  assert.ok(openApiDocument.paths['/documents/{id}/verification']);
  assert.ok(openApiDocument.paths['/documents/upload-url']);
  assert.ok(openApiDocument.paths['/documents/{id}/download-url']);
});

test('les opérations privées exigent un jeton et les connexions sont publiques', () => {
  assert.deepEqual(openApiDocument.paths['/auth/login'].post.security, []);
  assert.deepEqual(openApiDocument.paths['/admin/auth/login'].post.security, []);
  assert.deepEqual(openApiDocument.paths['/health'].get.security, []);
  assert.deepEqual(openApiDocument.paths['/offers'].get.security, [{ bearerAuth: [] }]);
});
