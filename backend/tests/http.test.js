const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app } = require('../index');
const openApiDocument = require('../openapi');
const { User } = require('../models');

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
  const allowedOrigin = (process.env.CLIENT_DOMAIN || 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',')[0]
    .trim();
  const allowedResponse = await fetch(`${apiUrl}/api/v1/health`, {
    headers: { origin: allowedOrigin }
  });
  assert.equal(allowedResponse.status, 200);
  assert.equal(allowedResponse.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.equal(allowedResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(allowedResponse.headers.get('x-powered-by'), null);

  const tunnelPreflight = await fetch(`${apiUrl}/api/v1/buyer/auth/register/request-code`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://combatable-lilith-unobjectivized.ngrok-free.dev',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    }
  });
  assert.equal(tunnelPreflight.status, 204);
  assert.equal(
    tunnelPreflight.headers.get('access-control-allow-origin'),
    'https://combatable-lilith-unobjectivized.ngrok-free.dev'
  );

  const lanPreflight = await fetch(`${apiUrl}/api/v1/buyer/auth/register/request-code`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://10.39.52.238:8080',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    }
  });
  assert.equal(lanPreflight.status, 204);
  assert.equal(
    lanPreflight.headers.get('access-control-allow-origin'),
    'http://10.39.52.238:8080'
  );

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
      assert.notEqual(
        response.status,
        404,
        `${method.toUpperCase()} ${path} (${operation.summary}) doit être monté`
      );
    }
  }
});

test('les routes d’inscription par rôle et de connexion valident les requêtes', async (context) => {
  const apiUrl = await startTestServer(context);
  for (const role of ['seller', 'buyer']) {
    const response = await fetch(`${apiUrl}/api/v1/${role}/auth/register/request-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 400, `inscription ${role}: validation d’e-mail attendue`);
  }

  for (const path of [
    '/api/v1/auth/login',
    '/api/v1/admin/auth/login',
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

test('les espaces API vendeur et acheteur exigent une authentification', async (context) => {
  const apiUrl = await startTestServer(context);
  for (const path of ['/api/v1/seller/offers', '/api/v1/buyer/tenders']) {
    const response = await fetch(`${apiUrl}${path}`);
    assert.equal(response.status, 401, `${path} doit exiger une session`);
  }
});

test('un jeton vendeur reçoit 403 dans buyer/* et inversement', async (context) => {
  const apiUrl = await startTestServer(context);
  const previousSecret = process.env.JWT_SECRET_KEY;
  const originalFindByPk = User.findByPk;
  const secret = 'routing-test-jwt-secret-with-more-than-32-characters';
  process.env.JWT_SECRET_KEY = secret;
  User.findByPk = async (id) => ({
    id,
    role: Number(id) === 1 ? 'SELLER' : 'BUYER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    organizationId: Number(id) + 10
  });

  try {
    for (const [userId, path] of [
      [1, '/api/v1/buyer/tenders'],
      [2, '/api/v1/seller/tenders']
    ]) {
      const token = jwt.sign({
        id: userId,
        role: userId === 1 ? 'SELLER' : 'BUYER',
        status: 'ACTIVE',
        organizationId: userId + 10
      }, secret);
      const response = await fetch(`${apiUrl}${path}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 403, `${path} doit refuser le rôle opposé`);
    }
  } finally {
    User.findByPk = originalFindByPk;
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
  }
});
