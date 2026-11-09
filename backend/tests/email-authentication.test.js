const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CLIENT_POLICY,
  ADMIN_POLICY,
  generateCode,
  hashCode,
  checkChallenge,
  assertUnusedEmail,
  matchesRegistrationChallenge,
  authenticationActionUrl,
  localizedEmail,
  findChallengeIncludingDeleted,
  restoreDeletedChallenge
} = require('../utils/emailAuthentication');

const previousSecret = process.env.OTP_HASH_SECRET;
process.env.OTP_HASH_SECRET = 'test-only-otp-secret-with-at-least-32-characters';

test.after(() => {
  if (previousSecret === undefined) delete process.env.OTP_HASH_SECRET;
  else process.env.OTP_HASH_SECRET = previousSecret;
});

test('les politiques OTP appliquent les longueurs, durées et tentatives attendues', () => {
  assert.deepEqual(CLIENT_POLICY, { digits: 6, lifetimeMinutes: 15, maxAttempts: 5 });
  assert.deepEqual(ADMIN_POLICY, { digits: 8, lifetimeMinutes: 10, maxAttempts: 3 });
  assert.equal(generateCode(CLIENT_POLICY.digits).length, 6);
  assert.equal(generateCode(ADMIN_POLICY.digits).length, 8);
});

test('un code faux est compté, puis verrouillé au maximum de tentatives', () => {
  const challenge = {
    codeHash: hashCode('123456'),
    failedAttempts: 0,
    maxAttempts: CLIENT_POLICY.maxAttempts,
    expiresAt: new Date(Date.now() + 60_000),
    verifiedAt: null
  };

  for (let attempt = 1; attempt < CLIENT_POLICY.maxAttempts; attempt += 1) {
    assert.equal(checkChallenge(challenge, '000000').status, 'invalid');
  }
  assert.equal(checkChallenge(challenge, '000000').status, 'locked');
  assert.equal(challenge.failedAttempts, CLIENT_POLICY.maxAttempts);
  assert.equal(checkChallenge(challenge, '123456').status, 'locked');
});

test('un code expiré ou déjà vérifié ne peut plus ouvrir de session', () => {
  const expired = {
    codeHash: hashCode('123456'),
    failedAttempts: 0,
    maxAttempts: 5,
    expiresAt: new Date(Date.now() - 1),
    verifiedAt: null
  };
  assert.equal(checkChallenge(expired, '123456').status, 'expired');

  const verified = { ...expired, expiresAt: new Date(Date.now() + 60_000), verifiedAt: new Date() };
  assert.equal(checkChallenge(verified, '123456').status, 'consumed');
});

test('un jeton d’inscription est lié à son rôle et à son adresse', () => {
  const claims = {
    email: 'seller@example.test',
    role: 'SELLER',
    purpose: 'EMAIL_REGISTRATION',
    challengeId: 42
  };
  assert.equal(matchesRegistrationChallenge(claims, 'SELLER', 'SELLER@example.test'), true);
  assert.equal(matchesRegistrationChallenge(claims, 'BUYER', 'seller@example.test'), false);
  assert.equal(matchesRegistrationChallenge(claims, 'SELLER', 'other@example.test'), false);
  assert.equal(matchesRegistrationChallenge({ ...claims, purpose: 'ADMIN_REGISTRATION' }, 'SELLER', claims.email), false);
});

test('une adresse déjà utilisée est refusée avant l’émission du code', async () => {
  await assert.rejects(
    assertUnusedEmail('USER@example.test', async (email) => email === 'user@example.test'),
    {
      status: 409,
      message: 'Cette adresse e-mail est déjà associée à un compte. Connectez-vous si vous avez déjà un compte, ou utilisez une autre adresse.'
    }
  );
  await assert.doesNotReject(
    assertUnusedEmail('new@example.test', async () => null)
  );
});

test('les e-mails de réinitialisation sont traduits pour les trois langues', () => {
  const french = localizedEmail('fr', '123456', 'PASSWORD_RESET');
  const english = localizedEmail('en', '123456', 'PASSWORD_RESET');
  const arabic = localizedEmail('ar', '123456', 'PASSWORD_RESET');

  assert.match(french.subject, /Réinitialisez votre mot de passe/);
  assert.match(english.subject, /Reset your MediTender password/);
  assert.match(arabic.subject, /إعادة تعيين كلمة مرور/);
  assert.match(french.html, /123456/);
  assert.match(english.html, /123456/);
  assert.match(arabic.html, /123456/);
});

test('les e-mails contiennent un lien vers le formulaire de vérification approprié', () => {
  const registrationUrl = authenticationActionUrl({
    email: 'buyer+test@example.test',
    role: 'BUYER',
    purpose: 'REGISTER',
    clientDomain: 'http://10.39.52.238:8080'
  });
  const resetUrl = authenticationActionUrl({
    email: 'user@example.test',
    role: 'SELLER',
    purpose: 'PASSWORD_RESET',
    clientDomain: 'https://app.example.test,https://backup.example.test'
  });
  const adminLoginUrl = authenticationActionUrl({
    email: 'admin@example.test',
    role: 'ADMIN',
    purpose: 'ADMIN_LOGIN',
    clientDomain: 'https://app.example.test'
  });
  const superAdminResetUrl = authenticationActionUrl({
    email: 'root@example.test',
    role: 'SUPER_ADMIN',
    purpose: 'PASSWORD_RESET',
    clientDomain: 'https://app.example.test'
  });
  const registrationEmail = localizedEmail('fr', '123456', 'REGISTER', registrationUrl);
  const resetEmail = localizedEmail('en', '123456', 'PASSWORD_RESET', resetUrl);
  const adminLoginEmail = localizedEmail('fr', '12345678', 'ADMIN_LOGIN', adminLoginUrl);

  assert.equal(registrationUrl, 'http://10.39.52.238:8080/register/buyer?email=buyer%2Btest%40example.test&verify=1');
  assert.equal(resetUrl, 'https://app.example.test/login?email=user%40example.test&reset=1');
  assert.match(registrationEmail.html, /Continuer l’inscription/);
  assert.match(registrationEmail.html, /register\/buyer\?email=buyer%2Btest%40example\.test&amp;verify=1/);
  assert.match(resetEmail.html, /Continue password reset/);
  assert.match(resetEmail.html, /\/login\?email=user%40example\.test&amp;reset=1/);
  assert.equal(adminLoginUrl, 'https://app.example.test/admin/login?email=admin%40example.test&verify=1');
  assert.equal(superAdminResetUrl, 'https://app.example.test/admin/login?email=root%40example.test&reset=1');
  assert.match(adminLoginEmail.html, /Continuer la connexion/);
});

test('refuse les liens d’action sans origine cliente HTTP(S) configurée', () => {
  assert.throws(
    () => authenticationActionUrl({
      email: 'user@example.test',
      role: 'BUYER',
      purpose: 'REGISTER',
      clientDomain: ''
    }),
    { status: 503, code: 'EMAIL_SERVICE_UNAVAILABLE' }
  );
  assert.throws(
    () => authenticationActionUrl({
      email: 'user@example.test',
      role: 'BUYER',
      purpose: 'REGISTER',
      clientDomain: 'javascript:alert(1)'
    }),
    { status: 503, code: 'EMAIL_SERVICE_UNAVAILABLE' }
  );
});

test('retrouve et restaure un défi supprimé logiquement avant sa réutilisation', async () => {
  const deletedChallenge = { deletedAt: new Date(), restored: false, async restore() { this.restored = true; } };
  let lookup;
  const model = {
    async findOne(options) {
      lookup = options;
      return deletedChallenge;
    }
  };

  const challenge = await findChallengeIncludingDeleted(model, 'USER@example.test', 'PASSWORD_RESET');
  await restoreDeletedChallenge(challenge);

  assert.deepEqual(lookup.where, { email: 'user@example.test', purpose: 'PASSWORD_RESET' });
  assert.equal(lookup.paranoid, false);
  assert.equal(deletedChallenge.restored, true);
});
