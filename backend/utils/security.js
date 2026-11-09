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

function requiredString(value, field, maxLength = 255) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    const error = new Error(`${field} est obligatoire et doit contenir au maximum ${maxLength} caractères.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function positiveNumber(value, field, { integer = false, allowZero = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0) || (integer && !Number.isInteger(number))) {
    const error = new Error(`${field} doit être un nombre ${allowZero ? 'positif ou nul' : 'strictement positif'}${integer ? ' entier' : ''}.`);
    error.status = 400;
    throw error;
  }
  return number;
}

module.exports = { hashPassword, verifyPassword, requiredString, positiveNumber };
