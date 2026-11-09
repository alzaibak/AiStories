const test = require('node:test');
const assert = require('node:assert/strict');
const openApiDocument = require('../openapi');

test('la documentation OpenAPI décrit chaque opération active de l’API', () => {
  const operationCount = Object.values(openApiDocument.paths)
    .reduce((count, path) => count + Object.keys(path).length, 0);

  assert.equal(openApiDocument.openapi, '3.0.3');
  assert.equal(operationCount, 78);
  assert.ok(openApiDocument.paths['/auth/password/request-code']);
  assert.ok(openApiDocument.paths['/auth/password/verify-code']);
  assert.ok(openApiDocument.paths['/auth/password/reset']);
  assert.deepEqual(openApiDocument.paths['/auth/password/request-code'].post.security, []);
  assert.deepEqual(openApiDocument.paths['/auth/password/verify-code'].post.security, []);
  assert.deepEqual(openApiDocument.paths['/auth/password/reset'].post.security, []);
  assert.ok(openApiDocument.paths['/reader/auth/register/verify-code']);
  assert.deepEqual(openApiDocument.paths['/stories/{slug}'].get.security, []);
  assert.ok(openApiDocument.paths['/admin/content/stories/{id}/publish']);
  assert.ok(openApiDocument.paths['/admin/content/media/upload-url']);
  assert.ok(openApiDocument.paths['/admin/subscriptions']);
  assert.ok(openApiDocument.paths['/payments/webhook']);
  assert.ok(openApiDocument.paths['/payments/books/checkout']);
  assert.ok(openApiDocument.paths['/payments/subscriptions/checkout']);
  assert.ok(openApiDocument.paths['/admin/plans']);
  assert.ok(openApiDocument.paths['/admin/subscriptions/{id}/cancel']);
  assert.ok(openApiDocument.paths['/admin/store-orders']);
  assert.ok(openApiDocument.paths['/admin/store-orders/{id}/fulfillment']);
  assert.ok(openApiDocument.paths['/admin/auth/verify-code']);
  assert.equal(openApiDocument.paths['/tenders'], undefined);
  assert.equal(openApiDocument.paths['/offers'], undefined);
  assert.equal(openApiDocument.paths['/documents'], undefined);
});

test('les opérations privées exigent un jeton et les connexions sont publiques', () => {
  assert.deepEqual(openApiDocument.paths['/auth/login'].post.security, []);
  assert.deepEqual(openApiDocument.paths['/admin/auth/login'].post.security, []);
  assert.deepEqual(openApiDocument.paths['/health'].get.security, []);
  assert.deepEqual(openApiDocument.paths['/plans'].get.security, []);
  assert.deepEqual(openApiDocument.paths['/payments/webhook'].post.security, []);
});
