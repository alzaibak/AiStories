const express = require('express');
const cors = require('cors');
const net = require('node:net');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
require('./config/environment').loadEnvironment();
const sequelize = require('./config/database');
const runMigrations = require('./migrate');

const app = express();
app.disable('x-powered-by');

const defaultAllowedOrigins = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'https://combatable-lilith-unobjectivized.ngrok-free.dev'
];
const allowedOrigins = [...new Set([
  ...defaultAllowedOrigins,
  ...(process.env.CLIENT_DOMAIN || '').split(',').map((origin) => origin.trim()).filter(Boolean)
])];
function isPrivateLanOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' || (url.port && url.port !== '8080') || !net.isIPv4(url.hostname)) {
    return false;
  }

  const [first, second] = url.hostname.split('.').map(Number);
  return first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.includes(origin) || isPrivateLanOrigin(origin));
  }
}));
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
app.use('/api/v1/auth/login', authenticationRateLimit());
app.use('/api/v1/auth/password/request-code', codeSendingRateLimit());
app.use('/api/v1/seller/auth/register/request-code', codeSendingRateLimit());
app.use('/api/v1/buyer/auth/register/request-code', codeSendingRateLimit());
app.use('/api/v1/auth/email/request-code', codeSendingRateLimit());
app.use('/api/v1/admin/auth/register/request-code', codeSendingRateLimit());
app.use('/api/v1/admin/auth/invitations', codeSendingRateLimit());
app.use('/api/v1/admin/auth/login', authenticationRateLimit());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const openApiDocument = require('./openapi');
app.get('/api/v1/openapi.json', (req, res) => res.json(openApiDocument));
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', service: 'e-tendering-api' }));

app.use('/api/v1', require('./routes/roleAuthentication'));
app.use('/api/v1/auth', require('./routes/authentication'));
app.use('/api/v1/tenders', require('./routes/tenders'));
app.use('/api/v1/offers', require('./routes/offers'));
app.use('/api/v1/catalog', require('./routes/catalog'));
app.use('/api/v1/documents', require('./routes/documents'));
app.use('/api/v1/collaboration', require('./routes/collaboration'));
app.use('/api/v1/purchase-orders', require('./routes/purchaseOrders'));
app.use('/api/v1/notifications', require('./routes/notifications'));
app.use('/api/v1/admin', require('./routes/admin'));

const { authenticate, namespaceRole } = require('./middleware/authorization');
const sellerNamespace = [authenticate, namespaceRole('SELLER')];
const buyerNamespace = [authenticate, namespaceRole('BUYER')];
for (const [prefix, middleware, routes] of [
  ['/api/v1/seller/offers', sellerNamespace, require('./routes/offers')],
  ['/api/v1/seller/tenders', sellerNamespace, require('./routes/tenders')],
  ['/api/v1/seller/catalog', sellerNamespace, require('./routes/catalog')],
  ['/api/v1/seller/documents', sellerNamespace, require('./routes/documents')],
  ['/api/v1/seller/collaboration', sellerNamespace, require('./routes/collaboration')],
  ['/api/v1/seller/notifications', sellerNamespace, require('./routes/notifications')],
  ['/api/v1/seller/purchase-orders', sellerNamespace, require('./routes/purchaseOrders')],
  ['/api/v1/buyer/tenders', buyerNamespace, require('./routes/tenders')],
  ['/api/v1/buyer/offers', buyerNamespace, require('./routes/offers')],
  ['/api/v1/buyer/documents', buyerNamespace, require('./routes/documents')],
  ['/api/v1/buyer/collaboration', buyerNamespace, require('./routes/collaboration')],
  ['/api/v1/buyer/notifications', buyerNamespace, require('./routes/notifications')],
  ['/api/v1/buyer/purchase-orders', buyerNamespace, require('./routes/purchaseOrders')]
]) {
  app.use(prefix, ...middleware, routes);
}

app.use((req, res) => res.status(404).json({ message: 'Route API introuvable.' }));

app.use((error, req, res, next) => {
  console.error('Erreur API :', error);
  if (res.headersSent) return next(error);
  const status = error.status ||
    (error.name === 'SequelizeUniqueConstraintError' ? 409 :
      error.name === 'SequelizeValidationError' ? 400 : 500);
  res.status(status).json({
    message: status >= 500 ? 'Une erreur serveur est survenue.' : error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(status === 400 && error.errors ? { details: error.errors.map((item) => item.message) } : {})
  });
});

async function startServer() {
  await sequelize.authenticate();
  await runMigrations('up');
  const port = Number(process.env.PORT) || 5000;
  return app.listen(port, '0.0.0.0', () => console.info(`API E-Tendering à l’écoute sur le port ${port}.`));
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Impossible de démarrer l’API :', error);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
