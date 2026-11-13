const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../index');
const openApiDocument = require('../openapi');
const jwt = require('jsonwebtoken');
const { Story, User } = require('../models');

async function startTestServer(context) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('l’API applique les en-têtes de sécurité et limite CORS aux origines autorisées', async (context) => {
  const apiUrl = await startTestServer(context);
  const allowedOrigin = (process.env.CLIENT_URL || process.env.CLIENT_DOMAIN || 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',')[0]
    .trim();
  const allowedResponse = await fetch(`${apiUrl}/api/v1/health`, {
    headers: { origin: allowedOrigin }
  });
  assert.equal(allowedResponse.status, 200);
  assert.equal(allowedResponse.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.equal(allowedResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(allowedResponse.headers.get('x-powered-by'), null);

  const unconfiguredPreflight = await fetch(`${apiUrl}/api/v1/reader/auth/register/request-code`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://unconfigured.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    }
  });
  assert.equal(unconfiguredPreflight.status, 200);
  assert.equal(unconfiguredPreflight.headers.get('access-control-allow-origin'), null);

  const adminOrigin = (process.env.ADMIN_URL || 'http://localhost:8081').split(',')[0].trim();
  const adminPreflight = await fetch(`${apiUrl}/api/admin/auth/login`, {
    method: 'OPTIONS',
    headers: {
      origin: adminOrigin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    }
  });
  assert.equal(adminPreflight.status, 204);
  assert.equal(adminPreflight.headers.get('access-control-allow-origin'), adminOrigin);

  const lanPreflight = await fetch(`${apiUrl}/api/v1/reader/auth/register/request-code`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://private-origin.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    }
  });
  assert.equal(lanPreflight.status, 200);
  assert.equal(lanPreflight.headers.get('access-control-allow-origin'), null);

  const rejectedResponse = await fetch(`${apiUrl}/api/v1/health`, {
    headers: { origin: 'https://untrusted.example' }
  });
  assert.equal(rejectedResponse.status, 200);
  assert.equal(rejectedResponse.headers.get('access-control-allow-origin'), null);
});

test('chaque route documentée est montée et renvoie autre chose qu’une route inconnue', async (context) => {
  const apiUrl = `${await startTestServer(context)}/api/v1`;
  for (const [path, operations] of Object.entries(openApiDocument.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const endpoint = path.replace(/\{[^}]+\}/g, '1');
      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: method.toUpperCase(),
        ...(method === 'get' ? {} : {
          headers: { 'content-type': 'application/json' },
          body: '{}'
        })
      });
      if (response.status === 404) {
        const body = await response.json();
        assert.notEqual(
          body.message,
          'Route API introuvable.',
          `${method.toUpperCase()} ${path} (${operation.summary}) doit être monté`
        );
      }
    }
  }
});

test('les routes d’inscription par rôle et de connexion valident les requêtes', async (context) => {
  const apiUrl = await startTestServer(context);
  const readerRegistration = await fetch(`${apiUrl}/api/v1/reader/auth/register/request-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(readerRegistration.status, 400, 'inscription lecteur: validation d’e-mail attendue');

  for (const path of [
    '/api/v1/auth/login',
    '/api/v1/admin/auth/login',
    '/api/admin/auth/login',
    '/api/v1/admin/auth/register/request-code'
  ]) {
    const response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 400, `POST ${path}: validation attendue`);
  }
});

test('la route publique de changement de mot de passe est montée et refuse les comptes admin', async (context) => {
  const apiUrl = await startTestServer(context);
  const previousSecret = process.env.JWT_SECRET_KEY;
  const originalFindByPk = User.findByPk;
  process.env.JWT_SECRET_KEY = 'test-secret-for-public-password-route';
  User.findByPk = async () => ({
    id: 8,
    role: 'ADMIN',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    tokenVersion: 0,
    mustChangePassword: false
  });
  context.after(() => {
    User.findByPk = originalFindByPk;
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
  });

  const token = jwt.sign({ id: 8, role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 }, process.env.JWT_SECRET_KEY);
  const response = await fetch(`${apiUrl}/api/v1/auth/password/change`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ currentPassword: 'existing-password', newPassword: 'StrongPass!23456' })
  });

  assert.equal(response.status, 403);
});

test('les anciennes routes d’appels d’offres ne sont plus montées', async (context) => {
  const apiUrl = await startTestServer(context);
  for (const path of ['/api/v1/tenders', '/api/v1/offers', '/api/v1/seller/tenders', '/api/v1/buyer/tenders']) {
    const response = await fetch(`${apiUrl}${path}`);
    assert.equal(response.status, 404, `${path} ne doit plus être exposée`);
  }
});

test('les invités ne lisent que la première partie gratuite d’une histoire publiée', async (context) => {
  const apiUrl = await startTestServer(context);
  const originalFindOne = Story.findOne;
  Story.findOne = async () => ({
    id: 8,
    isFree: false,
    collection: { isFree: true },
    parts: [
      { id: 80, partNumber: 1, content: 'Partie publique' },
      { id: 81, partNumber: 2, content: 'Partie protégée' }
    ],
    videos: []
  });
  try {
    const first = await fetch(`${apiUrl}/api/v1/stories/test-story/parts/1`);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).content, 'Partie publique');

    const second = await fetch(`${apiUrl}/api/v1/stories/test-story/parts/2`);
    assert.equal(second.status, 403);
    assert.equal((await second.json()).code, 'CONTENT_LOCKED');
  } finally {
    Story.findOne = originalFindOne;
  }
});

test('les paiements exigent une session lecteur et le webhook une configuration Stripe', async (context) => {
  const apiUrl = await startTestServer(context);
  const checkout = await fetch(`${apiUrl}/api/v1/payments/books/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ bookId: 1, quantity: 1 }] })
  });
  assert.equal(checkout.status, 401);

  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const webhook = await fetch(`${apiUrl}/api/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'evt_test' })
    });
    assert.equal(webhook.status, 503);
    assert.equal((await webhook.json()).code, 'PAYMENTS_UNAVAILABLE');
  } finally {
    if (previousSecret !== undefined) process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});
