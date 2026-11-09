const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { User, EmailAuthChallenge, Subscription, Plan } = require('../models');
const { hashPassword, verifyPassword } = require('../utils/security');
const { authenticate, allowRoles } = require('../middleware/authorization');
const {
  validateBody,
  readerRegistrationSchema,
  verificationRequestSchema,
  verificationSchema,
  passwordResetSchema,
  loginSchema,
  adminInvitationSchema,
  adminRegistrationSchema,
  adminApprovalSchema
} = require('../middleware/validation');
const {
  READER_POLICY,
  ADMIN_POLICY,
  RESEND_DELAY_SECONDS,
  DUPLICATE_EMAIL_MESSAGE,
  generateCode,
  hashCode,
  checkChallenge,
  findChallengeIncludingDeleted,
  restoreDeletedChallenge,
  assertUnusedEmail,
  matchesRegistrationChallenge,
  authenticationActionUrl
} = require('../utils/emailAuthentication');
const { sendAuthenticationCode } = require('../utils/email');
const { recordAudit } = require('../utils/audit');
const { subscriptionIsActive } = require('../utils/contentAccess');

function publicUser(user) {
  const result = user.toJSON();
  delete result.passwordHash;
  return result;
}

function accessToken(user) {
  if (!process.env.JWT_SECRET_KEY || process.env.JWT_SECRET_KEY.length < 32) {
    const error = new Error('La configuration JWT du serveur est manquante ou trop courte.');
    error.status = 503;
    throw error;
  }
  return jwt.sign({
    id: user.id,
    role: user.role,
    status: user.status,
    isAdmin: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
  }, process.env.JWT_SECRET_KEY, { expiresIn: '8h' });
}

function responseForChallengeError(res, status) {
  const responses = {
    invalid: [400, 'Code incorrect.'],
    locked: [429, 'Nombre maximal de tentatives atteint. Demandez un nouveau code.'],
    expired: [410, 'Le code a expiré. Demandez-en un nouveau.'],
    consumed: [409, 'Ce code a déjà été utilisé. Demandez-en un nouveau.']
  };
  const [httpStatus, message] = responses[status] || [400, 'Code invalide.'];
  return res.status(httpStatus).json({ message, codeStatus: status });
}

async function ensureUnusedEmail(email) {
  return assertUnusedEmail(email, (normalizedEmail) => User.findOne({ where: { email: normalizedEmail } }));
}

async function issueChallenge({ email, role, purpose, language, policy, rejectExistingUser }) {
  const normalizedEmail = email.toLowerCase();
  if (rejectExistingUser) await ensureUnusedEmail(normalizedEmail);

  const now = new Date();
  let challenge = await findChallengeIncludingDeleted(EmailAuthChallenge, normalizedEmail, purpose);
  const wasSoftDeleted = Boolean(challenge?.deletedAt);
  if (challenge && !wasSoftDeleted && new Date(challenge.resendAvailableAt) > now) {
    const retryAfter = Math.ceil((new Date(challenge.resendAvailableAt) - now) / 1000);
    const error = new Error('Veuillez patienter avant de demander un nouveau code.');
    error.status = 429;
    error.retryAfter = retryAfter;
    throw error;
  }

  const code = generateCode(policy.digits);
  const values = {
    email: normalizedEmail,
    role,
    purpose,
    codeHash: hashCode(code),
    failedAttempts: 0,
    maxAttempts: policy.maxAttempts,
    expiresAt: new Date(now.getTime() + policy.lifetimeMinutes * 60 * 1000),
    resendAvailableAt: new Date(now.getTime() + RESEND_DELAY_SECONDS * 1000),
    verifiedAt: null,
    consumedAt: null,
    deletedAt: null
  };
  if (challenge && wasSoftDeleted) await restoreDeletedChallenge(challenge);
  if (challenge) await challenge.update(values);
  else challenge = await EmailAuthChallenge.create(values);

  try {
    await sendAuthenticationCode({
      email: normalizedEmail,
      code,
      language,
      purpose,
      actionUrl: authenticationActionUrl({ email: normalizedEmail, role, purpose, language })
    });
  } catch (error) {
    await challenge.destroy({ force: true });
    throw error;
  }
  return { challenge, retryAfter: RESEND_DELAY_SECONDS };
}

async function consumeCode({ email, role, purpose, code, transaction }) {
  const challenge = await EmailAuthChallenge.findOne({
    where: { email: email.toLowerCase(), role, purpose },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!challenge) return { status: 'expired' };
  const result = checkChallenge(challenge, code);
  if (result.status !== 'verified') {
    if (result.status === 'invalid' || result.status === 'locked') await challenge.save({ transaction });
    return result;
  }
  await challenge.save({ transaction });
  return { status: 'verified', challenge };
}

router.post('/reader/auth/register/request-code', validateBody(verificationRequestSchema), async (req, res, next) => {
  try {
    const result = await issueChallenge({
      email: req.body.email,
      role: 'READER',
      purpose: 'REGISTER',
      language: req.body.language,
      policy: READER_POLICY,
      rejectExistingUser: true
    });
    res.status(202).json({
      message: 'Un code de vérification a été envoyé par e-mail.',
      expiresInSeconds: READER_POLICY.lifetimeMinutes * 60,
      retryAfterSeconds: result.retryAfter
    });
  } catch (error) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    next(error);
  }
});

router.post('/reader/auth/register/verify-code', validateBody(verificationSchema), async (req, res, next) => {
  let transaction;
  try {
    transaction = await User.sequelize.transaction();
    const result = await consumeCode({
      email: req.body.email,
      role: 'READER',
      purpose: 'REGISTER',
      code: req.body.code,
      transaction
    });
    if (result.status !== 'verified') {
      await transaction.commit();
      return responseForChallengeError(res, result.status);
    }
    await transaction.commit();
    const token = jwt.sign({
      email: result.challenge.email,
      role: 'READER',
      purpose: 'EMAIL_REGISTRATION',
      challengeId: result.challenge.id
    }, process.env.JWT_SECRET_KEY, { expiresIn: '15m' });
    res.json({ verificationToken: token, role: 'READER', expiresInSeconds: 900 });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.post('/reader/auth/register', validateBody(readerRegistrationSchema), async (req, res, next) => {
  let transaction;
  try {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token || !process.env.JWT_SECRET_KEY) {
      return res.status(401).json({ message: 'Vérifiez votre adresse e-mail avant de créer votre compte.' });
    }
    let claims;
    try {
      claims = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch {
      return res.status(401).json({ message: 'Le jeton de vérification est invalide ou expiré.' });
    }
    if (!matchesRegistrationChallenge(claims, 'READER', req.body.email)) {
      return res.status(403).json({ message: 'Le code vérifié ne correspond pas à cette adresse e-mail.' });
    }
    await ensureUnusedEmail(req.body.email);

    transaction = await User.sequelize.transaction();
    const challenge = await EmailAuthChallenge.findByPk(claims.challengeId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!challenge || challenge.email !== claims.email || challenge.role !== 'READER' ||
      challenge.purpose !== 'REGISTER' || !challenge.verifiedAt || challenge.consumedAt) {
      await transaction.rollback();
      return res.status(401).json({ message: 'La vérification e-mail est absente, expirée ou déjà utilisée.' });
    }
    const user = await User.create({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email.toLowerCase(),
      passwordHash: await hashPassword(req.body.password),
      role: 'READER',
      status: 'ACTIVE',
      language: req.body.language,
      emailVerifiedAt: new Date()
    }, { transaction });
    challenge.consumedAt = new Date();
    await challenge.save({ transaction });
    await transaction.commit();
    await recordAudit({ actor: user, ip: req.ip }, 'REGISTER', 'User', user.id, { role: 'READER' });
    res.status(201).json({ user: publicUser(user), message: 'Compte lecteur créé.' });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    if (error.status === 409) return res.status(409).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: DUPLICATE_EMAIL_MESSAGE });
    }
    next(error);
  }
});

router.post('/auth/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ where: { email } });
    if (!user || user.role !== 'READER' ||
      user.status !== 'ACTIVE' || !await verifyPassword(req.body.password, user.passwordHash)) {
      return res.status(401).json({ message: 'Identifiants invalides ou compte indisponible.' });
    }
    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Votre adresse e-mail n’est pas vérifiée. Renvoyez le code pour continuer.',
        canResendCode: true,
        role: user.role
      });
    }
    const token = accessToken(user);
    await recordAudit({ actor: user, ip: req.ip }, 'LOGIN', 'User', user.id);
    res.json({ user: publicUser(user), token });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/password/request-code', validateBody(verificationRequestSchema), async (req, res, next) => {
  try {
    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ where: { email } });
    if (user && ['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER', 'READER'].includes(user.role) &&
      user.status === 'ACTIVE' && user.emailVerifiedAt) {
      await issueChallenge({
        email,
        role: user.role,
        purpose: 'PASSWORD_RESET',
        language: req.body.language || user.language,
        policy: READER_POLICY,
        rejectExistingUser: false
      });
    }
    res.status(202).json({
      message: 'Si un compte actif et vérifié correspond à cette adresse, un code de réinitialisation lui a été envoyé.'
    });
  } catch (error) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    next(error);
  }
});

router.post('/auth/password/verify-code', validateBody(verificationSchema), async (req, res, next) => {
  let transaction;
  try {
    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ where: { email } });
    if (!user || !['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER', 'READER'].includes(user.role) ||
      user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      return res.status(400).json({ message: 'Le code est invalide ou expiré. Demandez un nouveau code.' });
    }

    transaction = await User.sequelize.transaction();
    const result = await consumeCode({
      email,
      role: user.role,
      purpose: 'PASSWORD_RESET',
      code: req.body.code,
      transaction
    });
    if (result.status !== 'verified') {
      await transaction.commit();
      return responseForChallengeError(res, result.status);
    }
    await transaction.commit();
    const resetToken = jwt.sign({
      email,
      role: user.role,
      purpose: 'PASSWORD_RESET',
      challengeId: result.challenge.id
    }, process.env.JWT_SECRET_KEY, { expiresIn: '15m' });
    return res.json({ resetToken, expiresInSeconds: 900 });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return next(error);
  }
});

router.post('/auth/password/reset', validateBody(passwordResetSchema), async (req, res, next) => {
  let transaction;
  try {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token || !process.env.JWT_SECRET_KEY) {
      return res.status(401).json({ message: 'Vérifiez le code reçu par e-mail avant de choisir un nouveau mot de passe.' });
    }

    let claims;
    try {
      claims = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch {
      return res.status(401).json({ message: 'Le code de réinitialisation est invalide ou expiré. Recommencez la procédure.' });
    }
    const email = req.body.email.toLowerCase();
    if (claims.purpose !== 'PASSWORD_RESET' || claims.email !== email ||
      !['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER', 'READER'].includes(claims.role) ||
      !Number.isInteger(claims.challengeId)) {
      return res.status(403).json({ message: 'Le code ne correspond pas à cette adresse e-mail.' });
    }

    transaction = await User.sequelize.transaction();
    const user = await User.findOne({
      where: { email, role: claims.role, status: 'ACTIVE' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const challenge = await EmailAuthChallenge.findByPk(claims.challengeId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!user || !challenge || challenge.email !== email || challenge.role !== claims.role ||
      challenge.purpose !== 'PASSWORD_RESET' || !challenge.verifiedAt || challenge.consumedAt) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Le code de réinitialisation est invalide, expiré ou déjà utilisé.' });
    }

    user.passwordHash = await hashPassword(req.body.password);
    challenge.consumedAt = new Date();
    await user.save({ transaction });
    await challenge.save({ transaction });
    await transaction.commit();
    await recordAudit({ actor: user, ip: req.ip }, 'PASSWORD_RESET', 'User', user.id);
    return res.json({ message: 'Votre mot de passe a été modifié. Vous pouvez vous connecter.' });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return next(error);
  }
});

router.post('/auth/email/request-code', validateBody(verificationRequestSchema), async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email.toLowerCase() } });
    if (!user || user.role !== 'READER' || user.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Impossible de démarrer la vérification de cette adresse.' });
    }
    if (user.emailVerifiedAt) {
      return res.status(409).json({ message: 'Cette adresse e-mail est déjà vérifiée.' });
    }
    const result = await issueChallenge({
      email: user.email,
      role: user.role,
      purpose: 'VERIFY_EMAIL',
      language: req.body.language || user.language,
      policy: READER_POLICY,
      rejectExistingUser: false
    });
    res.status(202).json({
      message: 'Un code de vérification a été envoyé par e-mail.',
      retryAfterSeconds: result.retryAfter,
      expiresInSeconds: READER_POLICY.lifetimeMinutes * 60
    });
  } catch (error) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    next(error);
  }
});

router.post('/auth/email/verify-code', validateBody(verificationSchema), async (req, res, next) => {
  let transaction;
  try {
    transaction = await User.sequelize.transaction();
    const user = await User.findOne({
      where: { email: req.body.email.toLowerCase() },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!user || user.role !== 'READER' || user.status !== 'ACTIVE') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Code invalide ou compte indisponible.' });
    }
    if (user.emailVerifiedAt) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Cette adresse e-mail est déjà vérifiée.' });
    }
    const result = await consumeCode({
      email: user.email,
      role: user.role,
      purpose: 'VERIFY_EMAIL',
      code: req.body.code,
      transaction
    });
    if (result.status !== 'verified') {
      await transaction.commit();
      return responseForChallengeError(res, result.status);
    }
    result.challenge.consumedAt = new Date();
    user.emailVerifiedAt = new Date();
    await user.save({ transaction });
    await result.challenge.save({ transaction });
    await transaction.commit();
    await recordAudit({ actor: user, ip: req.ip }, 'VERIFY_EMAIL', 'User', user.id);
    res.json({ message: 'Adresse e-mail vérifiée. Vous pouvez maintenant vous connecter.' });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.post('/admin/auth/invitations', authenticate, allowRoles('SUPER_ADMIN'), validateBody(adminInvitationSchema), async (req, res, next) => {
  try {
    const result = await issueChallenge({
      email: req.body.email,
      role: req.body.role,
      purpose: 'ADMIN_REGISTER',
      language: req.body.language,
      policy: ADMIN_POLICY,
      rejectExistingUser: true
    });
    await recordAudit(req, `INVITE_${req.body.role}`, 'User', req.body.email.toLowerCase(), { role: req.body.role });
    res.status(202).json({
      message: 'Invitation envoyée. Le nouvel administrateur doit vérifier son adresse avant la création du compte.',
      expiresInSeconds: ADMIN_POLICY.lifetimeMinutes * 60,
      retryAfterSeconds: result.retryAfter
    });
  } catch (error) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    next(error);
  }
});

router.post('/admin/auth/register/request-code', validateBody(verificationRequestSchema), async (req, res, next) => {
  try {
    const email = req.body.email.toLowerCase();
    const invitation = await EmailAuthChallenge.findOne({
      where: { email, role: ['ADMIN', 'EDITOR', 'REVIEWER'], purpose: 'ADMIN_REGISTER' }
    });
    if (!invitation || invitation.consumedAt) {
      return res.status(202).json({
        message: 'Si une invitation administrateur est en attente, un nouveau code sera envoyé.'
      });
    }

    const result = await issueChallenge({
      email,
      role: invitation.role,
      purpose: 'ADMIN_REGISTER',
      language: req.body.language,
      policy: ADMIN_POLICY,
      rejectExistingUser: true
    });
    res.status(202).json({
      message: 'Un nouveau code de vérification a été envoyé.',
      expiresInSeconds: ADMIN_POLICY.lifetimeMinutes * 60,
      retryAfterSeconds: result.retryAfter
    });
  } catch (error) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    next(error);
  }
});

router.get('/admin/auth/admins/pending', authenticate, allowRoles('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const admins = await User.findAll({
      where: { role: ['ADMIN', 'EDITOR', 'REVIEWER'], status: 'PENDING' },
      attributes: { exclude: ['passwordHash'] },
      order: [['createdAt', 'ASC']]
    });
    res.json(admins);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/auth/register/verify-code', validateBody(verificationSchema), async (req, res, next) => {
  let transaction;
  try {
    transaction = await User.sequelize.transaction();
    const invitation = await EmailAuthChallenge.findOne({
      where: {
        email: req.body.email.toLowerCase(),
        role: ['ADMIN', 'EDITOR', 'REVIEWER'],
        purpose: 'ADMIN_REGISTER'
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!invitation) {
      await transaction.commit();
      return responseForChallengeError(res, 'expired');
    }
    const result = await consumeCode({
      email: req.body.email,
      role: invitation.role,
      purpose: 'ADMIN_REGISTER',
      code: req.body.code,
      transaction
    });
    if (result.status !== 'verified') {
      await transaction.commit();
      return responseForChallengeError(res, result.status);
    }
    await transaction.commit();
    const token = jwt.sign({
      email: result.challenge.email,
      role: result.challenge.role,
      purpose: 'ADMIN_REGISTRATION',
      challengeId: result.challenge.id
    }, process.env.JWT_SECRET_KEY, { expiresIn: '10m' });
    res.json({ verificationToken: token, role: result.challenge.role, expiresInSeconds: 600 });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.post('/admin/auth/register', validateBody(adminRegistrationSchema), async (req, res, next) => {
  let transaction;
  try {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token || !process.env.JWT_SECRET_KEY) {
      return res.status(401).json({ message: 'Une invitation administrateur vérifiée est requise.' });
    }
    let claims;
    try {
      claims = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch {
      return res.status(401).json({ message: 'Le jeton d’invitation est invalide ou expiré.' });
    }
    if (!['ADMIN', 'EDITOR', 'REVIEWER'].includes(claims.role) ||
      req.body.role !== claims.role ||
      !matchesRegistrationChallenge(claims, claims.role, req.body.email, 'ADMIN_REGISTRATION')) {
      return res.status(403).json({ message: 'L’invitation ne correspond pas à cette adresse e-mail.' });
    }
    try {
      await ensureUnusedEmail(req.body.email);
    } catch (error) {
      if (error.status === 409) return res.status(409).json({ message: error.message });
      throw error;
    }

    transaction = await User.sequelize.transaction();
    const challenge = await EmailAuthChallenge.findByPk(claims.challengeId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!challenge || challenge.email !== claims.email || challenge.role !== claims.role ||
      challenge.purpose !== 'ADMIN_REGISTER' ||
      !challenge.verifiedAt || challenge.consumedAt) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Cette invitation est invalide ou déjà utilisée.' });
    }
    const user = await User.create({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email.toLowerCase(),
      passwordHash: await hashPassword(req.body.password),
      role: claims.role,
      organizationId: null,
      status: 'PENDING',
      language: req.body.language,
      emailVerifiedAt: new Date()
    }, { transaction });
    challenge.consumedAt = new Date();
    await challenge.save({ transaction });
    await transaction.commit();
    await recordAudit({ actor: user, ip: req.ip }, 'REGISTER_PENDING_ADMIN', 'User', user.id);
    res.status(202).json({
      message: 'Adresse e-mail vérifiée. Votre compte attend l’autorisation de l’administrateur principal.'
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: DUPLICATE_EMAIL_MESSAGE });
    }
    next(error);
  }
});

router.post('/admin/auth/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email.toLowerCase() } });
    if (!user || !['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role) ||
      user.status !== 'ACTIVE' || !user.emailVerifiedAt ||
      !await verifyPassword(req.body.password, user.passwordHash)) {
      return res.status(401).json({ message: 'Identifiants invalides ou compte indisponible.' });
    }
    const result = await issueChallenge({
      email: user.email,
      role: user.role === 'SUPER_ADMIN' ? 'ADMIN' : user.role,
      purpose: 'ADMIN_LOGIN',
      language: user.language,
      policy: ADMIN_POLICY,
      rejectExistingUser: false
    });
    res.status(202).json({
      message: 'Un code de confirmation a été envoyé à votre adresse e-mail.',
      expiresInSeconds: ADMIN_POLICY.lifetimeMinutes * 60,
      retryAfterSeconds: result.retryAfter
    });
  } catch (error) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    next(error);
  }
});

router.post('/admin/auth/verify-code', validateBody(verificationSchema), async (req, res, next) => {
  let transaction;
  try {
    transaction = await User.sequelize.transaction();
    const user = await User.findOne({
      where: { email: req.body.email.toLowerCase() },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!user || !['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role) || user.status !== 'ACTIVE') {
      await transaction.rollback();
      return res.status(401).json({ message: 'Identifiants invalides ou compte indisponible.' });
    }
    const result = await consumeCode({
      email: user.email,
      role: user.role === 'SUPER_ADMIN' ? 'ADMIN' : user.role,
      purpose: 'ADMIN_LOGIN',
      code: req.body.code,
      transaction
    });
    if (result.status !== 'verified') {
      await transaction.commit();
      return responseForChallengeError(res, result.status);
    }
    result.challenge.consumedAt = new Date();
    await result.challenge.save({ transaction });
    await transaction.commit();
    const token = accessToken(user);
    await recordAudit({ actor: user, ip: req.ip }, 'ADMIN_LOGIN', 'User', user.id);
    res.json({ user: publicUser(user), token });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.patch('/admin/auth/admins/:id/approval', authenticate, allowRoles('SUPER_ADMIN'), validateBody(adminApprovalSchema), async (req, res, next) => {
  try {
    const admin = await User.findByPk(req.params.id);
    if (!admin || !['ADMIN', 'EDITOR', 'REVIEWER'].includes(admin.role)) {
      return res.status(404).json({ message: 'Demande administrateur introuvable.' });
    }
    admin.status = req.body.status;
    await admin.save();
    await recordAudit(req, 'SET_ADMIN_APPROVAL', 'User', admin.id, { status: admin.status });
    res.json({ user: publicUser(admin) });
  } catch (error) {
    next(error);
  }
});

router.get('/auth/me', authenticate, async (req, res, next) => {
  try {
    const subscriptions = await Subscription.findAll({
      where: { userId: req.user.id },
      include: [{ model: Plan, as: 'plan', attributes: ['id', 'name', 'slug', 'price', 'currency', 'interval'] }],
      attributes: ['id', 'planId', 'status', 'startedAt', 'expiresAt', 'gracePeriodEndsAt', 'cancelAtPeriodEnd', 'stripeSubscriptionId', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    res.json({
      user: publicUser(req.user),
      subscriptions: subscriptions.map((subscription) => {
        const value = subscription.toJSON();
        const canManageRenewal = Boolean(value.stripeSubscriptionId);
        delete value.stripeSubscriptionId;
        return { ...value, accessActive: subscriptionIsActive(value), canManageRenewal };
      })
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
