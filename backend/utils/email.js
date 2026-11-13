const nodemailer = require('nodemailer');
const { localizedEmail } = require('./emailAuthentication');

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

async function deliverEmail({ to, subject, html, purpose }) {
  const { from, transporter } = createTransport();
  try {
    const result = await transporter.sendMail({ from, to, subject, html });
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
  await deliverEmail({ to: email, subject: message.subject, html: message.html, purpose });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function sendTemplateEmail({ templateCode, to, language, variables = {}, purpose = templateCode }) {
  const { EmailTemplate } = require('../models');
  const template = await EmailTemplate.findOne({ where: { code: templateCode, isActive: true } });
  if (!template) return false;
  const content = template.translations?.[language] || template.translations?.ar;
  if (!content?.subject?.trim() || !content?.body?.trim()) return false;

  const safeVariables = Object.fromEntries(Object.entries(variables).map(([key, value]) => [
    key,
    String(value ?? '').replace(/[\r\n]/g, ' ')
  ]));
  const subject = content.subject.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
    safeVariables[key] || ''
  );
  let html = escapeHtml(content.body).replace(/\n/g, '<br>');
  html = html.replace(/\{\{\s*actionUrl\s*\}\}/g, safeVariables.actionUrl
    ? `<a href="${escapeHtml(safeVariables.actionUrl)}">${escapeHtml(safeVariables.actionUrl)}</a>`
    : '');
  html = html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
    escapeHtml(safeVariables[key] || '')
  );
  await deliverEmail({ to, subject, html, purpose });
  return true;
}

module.exports = { sendAuthenticationCode, sendTemplateEmail, deliverEmail };
