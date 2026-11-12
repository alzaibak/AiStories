const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { apiErrorResponse, requestLanguage } = require('../utils/apiErrors');

test('les erreurs de validation Zod exposent des messages localisés par champ', () => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(12) }).safeParse({
    email: 'invalid',
    password: ''
  });
  const response = apiErrorResponse(parsed.error, 'en');

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'VALIDATION_FAILED');
  assert.equal(response.body.message, 'Please correct the highlighted fields and try again.');
  assert.equal(response.body.fields.email, 'This value is invalid.');
  assert.equal(response.body.fields.password, 'This value is invalid.');
});

test('les erreurs Sequelize uniques ne révèlent pas les messages internes', () => {
  const response = apiErrorResponse({
    name: 'SequelizeUniqueConstraintError',
    errors: [{ path: 'slug', message: 'Validation error' }]
  }, 'fr');

  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'UNIQUE_CONSTRAINT');
  assert.equal(response.body.fields.slug, 'Cette valeur est déjà utilisée.');
  assert.equal(response.body.message, 'Une valeur identique existe déjà. Choisissez-en une autre.');
});

test('la configuration du stockage renvoie une explication localisée et ne divulgue pas de détails', () => {
  const response = apiErrorResponse({
    status: 503,
    code: 'STORAGE_NOT_CONFIGURED',
    message: 'private key and secret details'
  }, 'en');

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'STORAGE_NOT_CONFIGURED');
  assert.match(response.body.message, /Private file storage is not configured/);
  assert.doesNotMatch(JSON.stringify(response.body), /private key|secret details/i);
});

test('la langue de la requête est validée avant son usage', () => {
  assert.equal(requestLanguage({ query: { lang: 'fr' }, headers: {} }), 'fr');
  assert.equal(requestLanguage({ query: { lang: 'invalid' }, headers: { 'accept-language': 'en-US,en;q=0.8' } }), 'en');
  assert.equal(requestLanguage({ query: {}, headers: {}, user: { language: 'fr' } }), 'fr');
  assert.equal(requestLanguage({ query: {}, headers: {} }), 'ar');
});
