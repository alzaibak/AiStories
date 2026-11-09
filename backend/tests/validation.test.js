const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBody, loginSchema, passwordResetSchema } = require('../middleware/validation');

test('la validation normalise les entrées valides avant le contrôleur', () => {
  const req = { body: { email: '  buyer@example.test ', password: 'secure-password' } };
  let continued = false;
  validateBody(loginSchema)(req, {}, () => { continued = true; });

  assert.equal(continued, true);
  assert.equal(req.body.email, 'buyer@example.test');
});

test('la validation rejette les entrées invalides avec des détails par champ', () => {
  const req = { body: { email: 'invalid-email', password: '' } };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let continued = false;

  validateBody(loginSchema)(req, res, () => { continued = true; });

  assert.equal(continued, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.details.length, 2);
});

test('la réinitialisation exige une adresse e-mail et un mot de passe fort', () => {
  assert.equal(passwordResetSchema.safeParse({
    email: 'buyer@example.test',
    password: 'a-long-enough-password'
  }).success, true);
  assert.equal(passwordResetSchema.safeParse({
    email: 'buyer@example.test',
    password: 'short'
  }).success, false);
});
