const nodemailer = require('nodemailer');
const { localizedEmail } = require('./emailAuthentication');
const { composeEmail, textToEmailHtml, templateCopy } = require('./emailLayout');

const AUTH_TEMPLATE_PURPOSES = {
  verification_code: 'REGISTER',
  password_reset: 'PASSWORD_RESET',
  admin_login: 'ADMIN_LOGIN',
  admin_invitation: 'ADMIN_REGISTER'
};

const SAMPLE_CODES = {
  ADMIN_LOGIN: '28158343',
  ADMIN_REGISTER: '28158343',
  PASSWORD_RESET: '281583',
  REGISTER: '281583'
};

function createTransport() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  const missingSettings = [
    ['SMTP_HOST', host],
    ['SMTP_FROM', from]
  ].filter(([, value]) => !value?.trim()).map(([name]) => name);
  if (missingSettings.length) {
    const error = new Error(
      `Configuration e-mail incomplète : ${missingSettings.join(', ')}. Vérifiez backend/.env et redémarrez l’API.`
    );
    error.status = 503;
    error.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw error;
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  const auth = process.env.SMTP_USER && process.env.SMTP_PASSWORD
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined;
  return {
    from,
    transporter: nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    ...(auth ? { auth } : {})
    })
  };
}

async function deliverEmail({ to, subject, html, text, purpose }) {
  const { from, transporter } = createTransport();
  try {
    const result = await transporter.sendMail({ from, to, subject, html, ...(text ? { text } : {}) });
    console.info(`E-mail ${purpose} envoyé (SMTP ${result.messageId ? 'accepted' : 'sent'}).`);
  } catch (cause) {
    console.error(`Échec d'envoi e-mail (${purpose}); code SMTP: ${cause.code || 'inconnu'}.`);
    const error = new Error('Le service e-mail est temporairement indisponible.');
    error.status = 503;
    error.code = 'EMAIL_SERVICE_UNAVAILABLE';
    error.cause = cause;
    throw error;
  }
}

function safeVariables(variables = {}) {
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [
    key,
    String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
  ]));
}

function fillTemplate(text, variables) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => variables[key] || '');
}

/**
 * Builds the subject and HTML for a stored template. Authentication templates always render the
 * designed code email so the message stays readable even when the editable body is a single line.
 */
function composeTemplateMessage({ template, templateCode, language = 'fr', variables = {} }) {
  const content = template?.translations?.[language] || template?.translations?.ar;
  if (!content?.subject?.trim() || !content?.body?.trim()) return null;

  const safe = safeVariables(variables);
  const authPurpose = AUTH_TEMPLATE_PURPOSES[templateCode];
  if (authPurpose) {
    const message = localizedEmail(
      language,
      safe.code || SAMPLE_CODES[authPurpose],
      authPurpose,
      safe.actionUrl
    );
    return {
      ...message,
      subject: fillTemplate(content.subject, safe).trim() || message.subject
    };
  }

  const subject = fillTemplate(content.subject, safe).trim();
  const copy = templateCopy(templateCode, language);
  const body = fillTemplate(content.body.replace(/\{\{\s*actionUrl\s*\}\}/g, ' '), safe).trim();

  return {
    subject,
    ...composeEmail({
      language,
      preheader: subject,
      title: copy.title || subject,
      bodyText: body.replace(/\n{3,}/g, '\n\n'),
      bodyHtml: textToEmailHtml(body, language),
      actionUrl: safe.actionUrl,
      actionLabel: copy.action
    })
  };
}

async function sendTemplateEmail({ templateCode, to, language, variables = {}, purpose = templateCode }) {
  const { EmailTemplate } = require('../models');
  const template = await EmailTemplate.findOne({ where: { code: templateCode, isActive: true } });
  if (!template) return false;
  const message = composeTemplateMessage({ template, templateCode, language, variables });
  if (!message) return false;

  await deliverEmail({ to, subject: message.subject, html: message.html, text: message.text, purpose });
  return true;
}

async function sendAuthenticationCode({ email, code, language, purpose, actionUrl }) {
  const templateCode = {
    REGISTER: 'verification_code',
    EMAIL_REGISTRATION: 'verification_code',
    PASSWORD_RESET: 'password_reset',
    ADMIN_LOGIN: 'admin_login',
    ADMIN_REGISTER: 'admin_invitation'
  }[purpose];
  if (templateCode && await sendTemplateEmail({
    templateCode,
    to: email,
    language,
    variables: { code, actionUrl }
  })) return;

  const message = localizedEmail(language, code, purpose, actionUrl);
  await deliverEmail({ to: email, subject: message.subject, html: message.html, text: message.text, purpose });
}

module.exports = { sendAuthenticationCode, sendTemplateEmail, deliverEmail, composeTemplateMessage };
