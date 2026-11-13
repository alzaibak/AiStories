const jwt = require('jsonwebtoken');
const { User } = require('../models');

async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentification requise.' });
    }
    const claims = jwt.verify(authorization.slice(7), process.env.JWT_SECRET_KEY);
    const user = await User.findByPk(claims.id);
    if (!user || user.status !== 'ACTIVE' || claims.status !== user.status || !user.emailVerifiedAt ||
      claims.role !== user.role || (claims.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Identifiants invalides ou compte indisponible.' });
    }
    const adminRequest = /^\/api\/(?:v1\/)?admin(?:\/|$)/.test(req.originalUrl);
    if (adminRequest && (claims.aud !== 'admin' ||
      !['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role))) {
      return res.status(403).json({ message: 'Une session administrateur valide est requise.' });
    }
    if (claims.aud === 'admin' && !adminRequest && !/\/auth\/me(?:\?|$)/.test(req.originalUrl)) {
      return res.status(403).json({ message: 'Cette session est réservée au sous-domaine administrateur.' });
    }
    if (user.mustChangePassword && !/\/(?:auth\/me|superadmin\/change-password)(?:\?|$)/.test(req.originalUrl)) {
      return res.status(403).json({ message: 'Un changement de mot de passe est obligatoire avant de continuer.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Jeton invalide ou expiré.' });
    }
    next(error);
  }
}

function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}

function allowRoles(...roles) {
  return (req, res, next) => {
    const effectiveRoles = req.user?.role === 'SUPER_ADMIN' && roles.includes('ADMIN')
      ? [...roles, 'SUPER_ADMIN']
      : roles;
    if (!req.user || !effectiveRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Rôle non autorisé.' });
    }
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, allowRoles };
