const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../utils/security');

test('les mots de passe sont hachés et vérifiés sans stockage réversible', async () => {
  const hash = await hashPassword('correct-horse-battery');
  assert.match(hash, /^pbkdf2\$310000\$/);
  assert.equal(await verifyPassword('correct-horse-battery', hash), true);
  assert.equal(await verifyPassword('mauvais-secret', hash), false);
});
