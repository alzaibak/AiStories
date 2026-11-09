const crypto = require('crypto');

const CLIENT_POLICY = { digits: 6, lifetimeMinutes: 15, maxAttempts: 5 };
const ADMIN_POLICY = { digits: 8, lifetimeMinutes: 10, maxAttempts: 3 };
const RESEND_DELAY_SECONDS = 60;
const DUPLICATE_EMAIL_MESSAGE =
  'Cette adresse e-mail est déjà associée à un compte. Connectez-vous si vous avez déjà un compte, ou utilisez une autre adresse.';

function generateCode(digits) {
  return crypto.randomInt(0, 10 ** digits).toString().padStart(digits, '0');
}

function hashCode(code) {
  const secret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret || secret.length < 32) {
    const error = new Error('La configuration OTP_HASH_SECRET (32 caractères minimum) est requise.');
    error.status = 503;
    throw error;
  }
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

function verifyCode(code, storedHash) {
  if (typeof code !== 'string' || !/^\d{6,8}$/.test(code) || typeof storedHash !== 'string') return false;
  const actual = Buffer.from(hashCode(code), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function checkChallenge(challenge, code, now = new Date()) {
  if (challenge.verifiedAt) return { status: 'consumed' };
  if (new Date(challenge.expiresAt) <= now) return { status: 'expired' };
  if (challenge.failedAttempts >= challenge.maxAttempts) return { status: 'locked' };
  if (!verifyCode(code, challenge.codeHash)) {
    challenge.failedAttempts += 1;
    return {
      status: challenge.failedAttempts >= challenge.maxAttempts ? 'locked' : 'invalid',
      failedAttempts: challenge.failedAttempts,
      remainingAttempts: Math.max(0, challenge.maxAttempts - challenge.failedAttempts)
    };
  }
  challenge.verifiedAt = now;
  return { status: 'verified' };
}

async function findChallengeIncludingDeleted(model, email, purpose) {
  return model.findOne({
    where: { email: email.toLowerCase(), purpose },
    paranoid: false
  });
}

async function restoreDeletedChallenge(challenge) {
  if (challenge?.deletedAt) await challenge.restore();
}

async function assertUnusedEmail(email, findUser) {
  if (await findUser(email.toLowerCase())) {
    const error = new Error(DUPLICATE_EMAIL_MESSAGE);
    error.status = 409;
    throw error;
  }
}

function matchesRegistrationChallenge(claims, role, email, purpose = 'EMAIL_REGISTRATION') {
  return claims?.purpose === purpose &&
    claims.role === role &&
    claims.email === email.toLowerCase() &&
    typeof claims.challengeId === 'number';
}

function localizedEmail(language, code, purpose, actionUrl) {
  const messages = {
    fr: {
      subject: purpose === 'PASSWORD_RESET' ? 'Réinitialisez votre mot de passe MediTender' : purpose === 'ADMIN_LOGIN' ? 'Votre code de connexion administrateur MediTender' : purpose === 'ADMIN_REGISTER' ? 'Invitation administrateur MediTender' : 'Vérifiez votre adresse e-mail MediTender',
      title: purpose === 'PASSWORD_RESET' ? 'Réinitialisation du mot de passe' : purpose === 'ADMIN_LOGIN' ? 'Confirmation de connexion' : purpose === 'ADMIN_REGISTER' ? 'Invitation administrateur' : 'Vérification de votre adresse e-mail',
      intro: purpose === 'PASSWORD_RESET' ? 'Saisissez ce code pour confirmer la réinitialisation de votre mot de passe.' : purpose === 'ADMIN_LOGIN' ? 'Saisissez ce code pour terminer votre connexion administrateur.' : purpose === 'ADMIN_REGISTER' ? 'Vous avez été invité à rejoindre MediTender en tant qu’administrateur. Saisissez ce code pour confirmer votre adresse.' : 'Saisissez ce code pour confirmer votre adresse e-mail.',
      expiry: 'Ce code expire dans',
      minutes: purpose === 'ADMIN_LOGIN' || purpose === 'ADMIN_REGISTER' ? '10 minutes' : '15 minutes',
      ignore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
      action: purpose === 'PASSWORD_RESET' ? 'Continuer la réinitialisation'
        : purpose === 'ADMIN_LOGIN' ? 'Continuer la connexion'
          : 'Continuer l’inscription'
    },
    en: {
      subject: purpose === 'PASSWORD_RESET' ? 'Reset your MediTender password' : purpose === 'ADMIN_LOGIN' ? 'Your MediTender administrator sign-in code' : purpose === 'ADMIN_REGISTER' ? 'MediTender administrator invitation' : 'Verify your MediTender email address',
      title: purpose === 'PASSWORD_RESET' ? 'Reset your password' : purpose === 'ADMIN_LOGIN' ? 'Confirm your sign-in' : purpose === 'ADMIN_REGISTER' ? 'Administrator invitation' : 'Verify your email address',
      intro: purpose === 'PASSWORD_RESET' ? 'Enter this code to confirm your password reset.' : purpose === 'ADMIN_LOGIN' ? 'Enter this code to complete your administrator sign-in.' : purpose === 'ADMIN_REGISTER' ? 'You have been invited to join MediTender as an administrator. Enter this code to verify your email.' : 'Enter this code to confirm your email address.',
      expiry: 'This code expires in',
      minutes: purpose === 'ADMIN_LOGIN' || purpose === 'ADMIN_REGISTER' ? '10 minutes' : '15 minutes',
      ignore: 'If you did not request this code, you can ignore this message.',
      action: purpose === 'PASSWORD_RESET' ? 'Continue password reset'
        : purpose === 'ADMIN_LOGIN' ? 'Continue sign-in'
          : 'Continue registration'
    },
    ar: {
      subject: purpose === 'PASSWORD_RESET' ? 'إعادة تعيين كلمة مرور MediTender' : purpose === 'ADMIN_LOGIN' ? 'رمز تسجيل دخول مسؤول MediTender' : purpose === 'ADMIN_REGISTER' ? 'دعوة مسؤول إلى MediTender' : 'تحقق من بريدك الإلكتروني في MediTender',
      title: purpose === 'PASSWORD_RESET' ? 'إعادة تعيين كلمة المرور' : purpose === 'ADMIN_LOGIN' ? 'تأكيد تسجيل الدخول' : purpose === 'ADMIN_REGISTER' ? 'دعوة مسؤول' : 'التحقق من عنوان البريد الإلكتروني',
      intro: purpose === 'PASSWORD_RESET' ? 'أدخل هذا الرمز لتأكيد إعادة تعيين كلمة المرور.' : purpose === 'ADMIN_LOGIN' ? 'أدخل هذا الرمز لإكمال تسجيل دخول المسؤول.' : purpose === 'ADMIN_REGISTER' ? 'تمت دعوتك للانضمام إلى MediTender كمسؤول. أدخل هذا الرمز لتأكيد بريدك الإلكتروني.' : 'أدخل هذا الرمز لتأكيد عنوان بريدك الإلكتروني.',
      expiry: 'تنتهي صلاحية هذا الرمز خلال',
      minutes: purpose === 'ADMIN_LOGIN' || purpose === 'ADMIN_REGISTER' ? '10 دقائق' : '15 دقيقة',
      ignore: 'إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.',
      action: purpose === 'PASSWORD_RESET' ? 'متابعة إعادة تعيين كلمة المرور'
        : purpose === 'ADMIN_LOGIN' ? 'متابعة تسجيل الدخول'
          : 'متابعة التسجيل'
    }
  };
  const copy = messages[language] || messages.fr;
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const action = actionUrl
    ? `<p style="margin:24px 0;text-align:center"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;border-radius:8px;background:#0b6b50;padding:12px 20px;color:#fff;text-decoration:none;font-weight:700">${copy.action}</a></p>`
    : '';
  return {
    subject: copy.subject,
    html: `<div style="margin:0;background:#f6faf8;padding:32px;font-family:Arial,sans-serif;color:#16302a" dir="${direction}"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #dceee4;border-radius:16px;padding:32px"><div style="font-size:20px;font-weight:700;color:#0b6b50">MediTender</div><h1 style="font-size:22px;margin:24px 0 12px">${copy.title}</h1><p style="line-height:1.6">${copy.intro}</p><div style="margin:24px 0;padding:18px;border-radius:12px;background:#e6f5ee;color:#0b6b50;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px">${code}</div>${action}<p>${copy.expiry} ${copy.minutes}.</p><p style="font-size:13px;color:#5e7a71">${copy.ignore}</p></div></div>`
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function authenticationActionUrl({ email, role, purpose, clientDomain = process.env.CLIENT_DOMAIN }) {
  let path;
  let queryName;
  if (purpose === 'REGISTER' && ['BUYER', 'SELLER'].includes(role)) {
    path = `/register/${role.toLowerCase()}`;
    queryName = 'verify';
  } else if (purpose === 'ADMIN_REGISTER' && role === 'ADMIN') {
    path = '/admin/register';
    queryName = 'verify';
  } else if (purpose === 'ADMIN_LOGIN' && role === 'ADMIN') {
    path = '/admin/login';
    queryName = 'verify';
  } else if (purpose === 'PASSWORD_RESET' && ['ADMIN', 'BUYER', 'SELLER'].includes(role)) {
    path = role === 'ADMIN' ? '/admin/login' : '/login';
    queryName = 'reset';
  } else if (purpose === 'PASSWORD_RESET' && role === 'SUPER_ADMIN') {
    path = '/admin/login';
    queryName = 'reset';
  } else {
    return null;
  }

  const configuredOrigin = clientDomain?.split(',')[0]?.trim();
  if (!configuredOrigin) {
    const error = new Error('La configuration CLIENT_DOMAIN est requise pour créer le lien sécurisé.');
    error.status = 503;
    error.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw error;
  }

  let url;
  try {
    url = new URL(path, configuredOrigin);
  } catch {
    url = null;
  }
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    const error = new Error('La configuration CLIENT_DOMAIN doit être une URL HTTP(S) valide.');
    error.status = 503;
    error.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw error;
  }
  url.searchParams.set('email', email.toLowerCase());
  url.searchParams.set(queryName, '1');
  return url.toString();
}

module.exports = {
  CLIENT_POLICY,
  ADMIN_POLICY,
  RESEND_DELAY_SECONDS,
  DUPLICATE_EMAIL_MESSAGE,
  generateCode,
  hashCode,
  verifyCode,
  findChallengeIncludingDeleted,
  restoreDeletedChallenge,
  checkChallenge,
  assertUnusedEmail,
  matchesRegistrationChallenge,
  authenticationActionUrl,
  localizedEmail
};
