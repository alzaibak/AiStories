const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

function createSessionToken(user) {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret || secret.length < 32) {
    const error = new Error('La configuration JWT du serveur est manquante ou trop courte.');
    error.status = 503;
    throw error;
  }
  return jwt.sign({
    id: user.id,
    role: user.role,
    status: user.status,
    isAdmin: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
    aud: ['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role) ? 'admin' : 'client',
    tokenVersion: user.tokenVersion || 0,
    jti: crypto.randomUUID()
  }, secret, {
    expiresIn: ['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role) ? '3h' : '3d'
  });
}

module.exports = { createSessionToken };
