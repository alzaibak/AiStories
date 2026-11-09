const nodemailer = require('nodemailer');
const { localizedEmail } = require('./emailAuthentication');

async function sendAuthenticationCode({ email, code, language, purpose, actionUrl }) {
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
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(auth ? { auth } : {})
  });
  const message = localizedEmail(language, code, purpose, actionUrl);
  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: message.subject,
      html: message.html
    });
  } catch (cause) {
    const error = new Error('Le service e-mail est temporairement indisponible.');
    error.status = 503;
    error.code = 'EMAIL_SERVICE_UNAVAILABLE';
    error.cause = cause;
    throw error;
  }
}

module.exports = { sendAuthenticationCode };
