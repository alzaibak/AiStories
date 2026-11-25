const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const { apiErrorResponse, requestLanguage } = require('./utils/apiErrors');
require('./config/environment').loadEnvironment();
const sequelize = require('./config/database');
const runMigrations = require('./migrate');
const { processDueReminders } = require('./utils/reminders');
const { processReturnDeadlines } = require('./utils/returns/service');
const {
  refreshMysteryBoxStatuses,
  releaseExpiredMysteryBoxReservations
} = require('./utils/mysteryBoxService');

const path = require('path');
const app = express();
let reminderTimer;
let mysteryBoxTimer;
let returnTimer;
let paymentTimer;
app.disable('x-powered-by');

const clientDevelopmentOrigins = ['http://localhost:8080', 'http://127.0.0.1:8080'];
const adminDevelopmentOrigins = ['http://localhost:8081', 'http://127.0.0.1:8081'];
const clientOrigins = [...new Set([
  ...clientDevelopmentOrigins,
  ...(process.env.CLIENT_URL || process.env.CLIENT_DOMAIN || '').split(',').map((origin) => origin.trim()).filter(Boolean)
])];
const adminOrigins = [...new Set([
  ...adminDevelopmentOrigins,
  ...(process.env.ADMIN_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean)
])];
app.use(helmet());
app.use(cors((req, callback) => {
  const requestOrigin = req.header('Origin');
  if (!requestOrigin) return callback(null, { origin: true });
  const isAdminApi = req.path.startsWith('/api/admin') || req.path.startsWith('/api/v1/admin');
  const isIdentity = req.path === '/api/v1/auth/me';
  const allowed = isAdminApi
    ? adminOrigins.includes(requestOrigin)
    : isIdentity
      ? clientOrigins.includes(requestOrigin) || adminOrigins.includes(requestOrigin)
      : clientOrigins.includes(requestOrigin);
  callback(null, { origin: allowed ? requestOrigin : false });
}));
app.use((req, res, next) => {
  if (req.url === '/api/admin' || req.url.startsWith('/api/admin/')) {
    req.url = req.url.replace(/^\/api\/admin(?=\/|$)/, '/api/v1/admin');
  }
  next();
});
app.use('/api/v1', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));
function authenticationRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Trop de tentatives. Réessayez dans quelques minutes.' }
  });
}
function codeSendingRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Trop de demandes de code. Réessayez dans quelques minutes.' }
  });
}
function sensitiveActionRateLimit(limit = 20) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Trop de tentatives. Réessayez dans une minute.', code: 'RATE_LIMITED' }
  });
}
app.use('/api/v1/payments', sensitiveActionRateLimit(20));
app.use('/api/v1/cart', sensitiveActionRateLimit(60));
app.use('/api/v1/donation-campaigns', sensitiveActionRateLimit(20));
app.use('/api/v1/donations', sensitiveActionRateLimit(20));
app.use('/api/v1/downloads', sensitiveActionRateLimit(30));
app.use('/api/v1/auth/login', authenticationRateLimit());
app.use('/api/v1/auth/password/request-code', codeSendingRateLimit());
app.use('/api/v1/reader/auth/register/request-code', codeSendingRateLimit());
app.use('/api/v1/quizzes', rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));
app.use('/api/v1/auth/email/request-code', codeSendingRateLimit());
app.use('/api/v1/admin/auth/register/request-code', codeSendingRateLimit());
app.use('/api/v1/admin/auth/invitations', codeSendingRateLimit());
app.use('/api/v1/admin/auth/login', authenticationRateLimit());

const paymentRoutes = require('./routes/payments');
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), paymentRoutes.stripeWebhookHandler);

app.use('/uploads/public', express.static(path.join(__dirname, 'public_uploads'), {
  maxAge: '30d',
  immutable: true,
  fallthrough: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const openApiDocument = require('./openapi');
app.get('/api/v1/openapi.json', (req, res) => res.json(openApiDocument));
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', service: 'islamic-stories-api' }));

app.use('/api/v1', require('./routes/roleAuthentication'));
app.use('/api/v1', require('./routes/cart'));
app.use('/api/v1', paymentRoutes.router);
app.use('/api/v1', require('./routes/mysteryBox'));
app.use('/api/v1', require('./routes/returns'));
app.use('/api/v1', require('./routes/badges'));
app.use('/api/v1', require('./routes/library'));
app.use('/api/v1', require('./routes/security'));
app.use('/api/v1', require('./routes/donationPlans'));
app.use('/api/v1', require('./routes/storyPlatform'));

app.use((req, res) => res.status(404).json({ message: 'Route API introuvable.' }));

app.use((error, req, res, next) => {
  console.error('Erreur API :', error);
  if (res.headersSent) return next(error);
  const response = apiErrorResponse(error, requestLanguage(req));
  res.status(response.status).json(response.body);
});

async function startServer() {
  await sequelize.authenticate();
  await runMigrations('up');
  const port = Number(process.env.PORT) || 5000;
  const server = app.listen(port, '0.0.0.0', () => console.info(`API Islamic Stories à l’écoute sur le port ${port}.`));
  startReminderScheduler();
  startMysteryBoxScheduler();
  startReturnScheduler();
  startPaymentScheduler();
  return server;
}

function startPaymentScheduler() {
  if (paymentTimer) return paymentTimer;
  const interval = Number(process.env.PAYMENT_RECONCILE_INTERVAL_MS || 600000);
  if (!Number.isInteger(interval) || interval < 60000 || interval > 3600000) {
    throw new Error('PAYMENT_RECONCILE_INTERVAL_MS must be between 60000 and 3600000.');
  }
  let running = false;
  paymentTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const result = await paymentRoutes.reconcileStalePayments({ olderThanMinutes: 10 });
      if (result.orders || result.donations) {
        console.info(`Stripe reconciliation: ${result.orders} order(s), ${result.donations} donation(s).`);
      }
    } catch (error) {
      console.error('Scheduled Stripe reconciliation failed:', error.message);
    } finally {
      running = false;
    }
  }, interval);
  paymentTimer.unref();
  return paymentTimer;
}

function startReminderScheduler() {
  if (reminderTimer) return reminderTimer;
  const interval = Number(process.env.REMINDER_POLL_INTERVAL_MS || 60000);
  if (!Number.isInteger(interval) || interval < 5000 || interval > 3600000) {
    throw new Error('REMINDER_POLL_INTERVAL_MS must be between 5000 and 3600000.');
  }
  let running = false;
  reminderTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { processed, sent } = await processDueReminders();
      if (processed) console.info(`Rappels traités : ${processed}; e-mails envoyés : ${sent}.`);
    } catch (error) {
      console.error('Échec du traitement automatique des rappels :', error);
    } finally {
      running = false;
    }
  }, interval);
  reminderTimer.unref();
  return reminderTimer;
}

function startMysteryBoxScheduler() {
  if (mysteryBoxTimer) return mysteryBoxTimer;
  const interval = Number(process.env.MYSTERY_BOX_POLL_INTERVAL_MS || 60000);
  if (!Number.isInteger(interval) || interval < 5000 || interval > 3600000) {
    throw new Error('MYSTERY_BOX_POLL_INTERVAL_MS must be between 5000 and 3600000.');
  }
  let running = false;
  mysteryBoxTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const transitions = await refreshMysteryBoxStatuses();
      const released = await releaseExpiredMysteryBoxReservations();
      if (transitions.activated || transitions.ended) {
        console.info(`Mystery Box : ${transitions.activated} activée(s), ${transitions.ended} terminée(s).`);
      }
      if (released) console.info(`Mystery Box : ${released} réservation(s) libérée(s).`);
    } catch (error) {
      console.error('Échec du traitement automatique des Mystery Box :', error);
    } finally {
      running = false;
    }
  }, interval);
  mysteryBoxTimer.unref();
  return mysteryBoxTimer;
}

function startReturnScheduler() {
  if (returnTimer) return returnTimer;
  const interval = Number(process.env.RETURN_POLL_INTERVAL_MS || 300000);
  if (!Number.isInteger(interval) || interval < 5000 || interval > 3600000) {
    throw new Error('RETURN_POLL_INTERVAL_MS must be between 5000 and 3600000.');
  }
  let running = false;
  returnTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const result = await processReturnDeadlines();
      if (result.expired || result.reminded) {
        console.info(`Retours : ${result.expired} expiré(s), ${result.reminded} rappel(s) envoyé(s).`);
      }
    } catch (error) {
      console.error('Échec du traitement automatique des retours :', error);
    } finally {
      running = false;
    }
  }, interval);
  returnTimer.unref();
  return returnTimer;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Impossible de démarrer l’API :', error);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer, startReminderScheduler, startMysteryBoxScheduler, startReturnScheduler };
