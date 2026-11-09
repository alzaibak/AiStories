const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, requiredString, positiveNumber } = require('../utils/security');

test('les mots de passe sont hachés et vérifiés sans stockage réversible', async () => {
  const hash = await hashPassword('correct-horse-battery');
  assert.match(hash, /^pbkdf2\$310000\$/);
  assert.equal(await verifyPassword('correct-horse-battery', hash), true);
  assert.equal(await verifyPassword('mauvais-secret', hash), false);
});

test('la validation rejette les chaînes vides et les valeurs numériques invalides', () => {
  assert.equal(requiredString('  Paracétamol ', 'DCI'), 'Paracétamol');
  assert.throws(() => requiredString('  ', 'DCI'), { status: 400 });
  assert.equal(positiveNumber('12', 'Quantité'), 12);
  assert.throws(() => positiveNumber(0, 'Quantité'), { status: 400 });
  assert.throws(() => positiveNumber(1.5, 'Identifiant', { integer: true }), { status: 400 });
});
