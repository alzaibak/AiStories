const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2 = promisify(crypto.pbkdf2);
const ITERATIONS = 310000;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await pbkdf2(password, salt, ITERATIONS, 64, 'sha512');
  return `pbkdf2$${ITERATIONS}$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;
  const [algorithm, iterationsText, salt, expectedHex] = storedHash.split('$');
  const iterations = Number(iterationsText);
  if (algorithm !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 100000 || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await pbkdf2(password, salt, iterations, expected.length, 'sha512');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword };
