const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBody,
  loginSchema,
  passwordResetSchema,
  readerRegistrationSchema
} = require('../middleware/validation');
const { videoSchema, mediaUploadSchema } = require('../middleware/storyValidation');

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

test('l’inscription lecteur ne requiert pas d’organisation et utilise l’arabe par défaut', () => {
  const result = readerRegistrationSchema.safeParse({
    firstName: 'Amal',
    lastName: 'Lectrice',
    email: 'reader@example.test',
    password: 'a-secure-reader-password'
  });

  test('les médias imposent la confirmation de représentation et des URL HTTP(S)', () => {
    const media = {
      storyId: 1,
      mediaType: 'image',
      fileName: 'scene.png',
      mimeType: 'image/png',
      depictionPolicyConfirmed: true
    };
    assert.equal(mediaUploadSchema.safeParse(media).success, true);
    assert.equal(mediaUploadSchema.safeParse({ ...media, depictionPolicyConfirmed: false }).success, false);
    assert.equal(videoSchema.safeParse({
      episodeNumber: 1,
      depictionPolicyConfirmed: true,
      videoUrl: 'javascript:alert(1)'
    }).success, false);
  });
  assert.equal(result.success, true);
  assert.equal(result.data.language, 'ar');
});
