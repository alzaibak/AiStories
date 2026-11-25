const { SecurityEvent, User } = require('../models');

const SEVERITIES = ['info', 'warning', 'high', 'critical'];

function requestIp(req) {
  return String(req?.ip || req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 64) || null;
}

function safeRoute(req) {
  const original = req?.originalUrl || req?.url || '';
  return String(original).split('?')[0].slice(0, 255) || 'unknown';
}

/**
 * Never throw from a security log: the caller is already handling a rejected
 * request, and a logging failure must not turn a 403 into a 500.
 */
async function logSecurityEvent(req, {
  type,
  severity = 'warning',
  reason,
  metadata = {},
  userId = null
} = {}) {
  try {
    const actorId = userId || req?.user?.id || null;
    const event = await SecurityEvent.create({
      userId: actorId,
      ip: requestIp(req),
      route: safeRoute(req),
      method: String(req?.method || 'UNKNOWN').slice(0, 10),
      type: String(type || 'security_event').slice(0, 80),
      severity: SEVERITIES.includes(severity) ? severity : 'warning',
      reason: String(reason || 'Blocked request').slice(0, 1000),
      metadata
    });
    if (['high', 'critical'].includes(event.severity)) {
      await alertAdmins(event);
    }
    return event;
  } catch (error) {
    console.error('Security event could not be recorded:', error.message);
    return null;
  }
}

async function alertAdmins(event) {
  const configured = String(process.env.SECURITY_ALERT_EMAIL || '').trim();
  if (!configured) {
    console.warn(`[SECURITY ${event.severity}] ${event.type}: ${event.reason}`);
    return;
  }
  try {
    const { sendTemplateEmail } = require('./email');
    const admins = await User.findAll({
      where: { role: ['ADMIN', 'SUPER_ADMIN'] },
      attributes: ['email', 'language'],
      limit: 20
    });
    const recipients = [...new Set([configured, ...admins.map((admin) => admin.email)])];
    await Promise.all(recipients.map((email) => sendTemplateEmail({
      templateCode: 'security_alert',
      to: email,
      language: 'fr',
      variables: {
        type: event.type,
        severity: event.severity,
        reason: event.reason,
        route: `${event.method} ${event.route}`,
        date: event.createdAt.toISOString()
      },
      purpose: 'security alert'
    }).catch(() => false)));
  } catch (error) {
    console.error('Security alert email could not be sent:', error.message);
  }
}

module.exports = { logSecurityEvent, requestIp };
