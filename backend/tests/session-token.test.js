const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createSessionToken } = require('../utils/sessionToken');

test('les connexions client et admin reçoivent des JWT uniques aux durées distinctes', () => {
  const previousSecret = process.env.JWT_SECRET_KEY;
  process.env.JWT_SECRET_KEY = 'test-secret-with-at-least-32-characters';
  try {
    const readerFirst = createSessionToken({ id: 7, role: 'READER', status: 'ACTIVE' });
    const readerSecond = createSessionToken({ id: 7, role: 'READER', status: 'ACTIVE' });
    const adminToken = createSessionToken({ id: 8, role: 'SUPER_ADMIN', status: 'ACTIVE' });
    const readerFirstClaims = jwt.verify(readerFirst, process.env.JWT_SECRET_KEY);
    const readerSecondClaims = jwt.verify(readerSecond, process.env.JWT_SECRET_KEY);
    const adminClaims = jwt.verify(adminToken, process.env.JWT_SECRET_KEY);

    assert.notEqual(readerFirst, readerSecond);
    assert.notEqual(readerFirstClaims.jti, readerSecondClaims.jti);
    assert.equal(readerFirstClaims.exp - readerFirstClaims.iat, 3 * 24 * 60 * 60);
    assert.equal(adminClaims.exp - adminClaims.iat, 3 * 60 * 60);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
  }
});
