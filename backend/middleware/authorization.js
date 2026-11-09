const jwt = require('jsonwebtoken');
const { User, Organization } = require('../models');

async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentification requise.' });
    }
    const claims = jwt.verify(authorization.slice(7), process.env.JWT_SECRET_KEY);
    const user = await User.findByPk(claims.id, {
      include: [{ model: Organization, as: 'organization' }]
    });
    if (!user || user.status !== 'ACTIVE' || claims.status !== user.status || !user.emailVerifiedAt ||
      claims.role !== user.role || claims.organizationId !== user.organizationId) {
      return res.status(401).json({ message: 'Identifiants invalides ou compte indisponible.' });
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

async function requireApprovedSeller(req, res, next) {
  if (req.user.role !== 'SELLER') {
    return res.status(403).json({ message: 'Accès réservé aux vendeurs.' });
  }
  const organization = req.user.organization;
  if (!organization || organization.verificationStatus !== 'APPROVED') {
    return res.status(403).json({ message: 'Le vendeur doit être vérifié avant cette opération.' });
  }
  next();
}

function namespaceRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'Rôle non autorisé pour cet espace API.' });
    }
    next();
  };
}

module.exports = { authenticate, allowRoles, requireApprovedSeller, namespaceRole };
