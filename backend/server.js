require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const authFirebase = require('./routes/authFirebase');
const shopRoutes = require('./routes/shopRoutes');
const shopAdminRoutes = require('./routes/shopAdminRoutes');
const shopVisibilityRoutes = require('./routes/shopVisibilityRoutes');
const productRoutes = require('./routes/productRoutes')
const orderRoutes = require('./routes/orderRoutes');
const orderAdminRoutes = require('./routes/orderAdminRoutes');
const publicProductRoutes = require('./routes/publicProductRoutes');
const serviceCategoryRoutes = require('./routes/serviceCategoryRoutes');
const serviceRequestRoutes = require('./routes/serviceRequestRoutes');
const serviceOfferRoutes = require('./routes/serviceOfferRoutes');
const serviceAdminRoutes = require('./routes/serviceAdminRoutes');
const serviceHistoryRoutes = require('./routes/serviceHistoryRoutes');
const eventAdminRoutes = require('./routes/eventAdminRoutes');
const eventUserRoutes = require('./routes/eventUserRoutes');
const eventRegistrationAdminRoutes = require('./routes/eventRegistrationAdminRoutes');
const localNewsAdminRoutes = require('./routes/localNewsAdminRoutes');
const localNewsUserRoutes = require('./routes/localNewsUserRoutes');
const enquireUserRoutes = require('./routes/enquireUserRoutes');
const enquireAdminRoutes = require('./routes/enquireAdminRoutes');
const contestAdminRoutes = require('./routes/contestAdminRoutes');
const contestUserRoutes = require('./routes/contestUserRoutes');
const contestVoteRoutes = require('./routes/contestVoteRoutes');
const contestLeaderboardRoutes = require('./routes/contestLeaderboardRoutes');
const mobileRoutes = require('./routes/mobileRoutes');
const mobileShopRoutes = require('./routes/mobile/shopRoutes');
const mobileProductRoutes = require('./routes/mobile/productRoutes');
const mobileCartRoutes = require('./routes/mobile/cartRoutes');
const mobileOrderRoutes = require('./routes/mobile/orderRoutes');
const publicRoutes = require('./routes/publicRoutes');
const { startServiceExpiryJob } = require('./utils/jobs/serviceExpiryJob');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { validateEnv } = require('./utils/env');
const { query } = require('./config/db');
const authMiddleware = require('./middlewares/authMiddleware');
const locationMiddleware = require('./middlewares/locationMiddleware');
const requestIdMiddleware = require('./middlewares/requestIdMiddleware');

// Validate environment variables
validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "127.0.0.1";

// Trust proxy (required for Nginx/Load Balancer)
app.set('trust proxy', 1);

// Middleware
app.use(requestIdMiddleware);
app.use(helmet());
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// CORS
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [])
    : '*',
};
app.use(cors(corsOptions));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.use(express.json({ limit: '1mb' }));

// Mount Firebase auth routes before existing auth routes to override registration logic
app.use('/api/auth', authFirebase);
app.use('/api/auth', authRoutes);

// Endpoints

// A) GET /health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'manacity-api',
    time: new Date().toISOString(),
  });
});

// B) GET /health/db
app.get('/health/db', async (req, res) => {
  try {
    // Run a simple query to verify connectivity
    await query('SELECT 1 as ok');
    res.json({
      status: 'ok',
      db: 'connected',
    });
  } catch (err) {
    console.error('DB Health Check Failed:', err);
    res.status(500).json({
      status: 'error',
      db: 'disconnected',
      message: err.message,
    });
  }
});

// Swagger UI
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
const swaggerUiOptions = {
  swaggerOptions: {
    persistAuthorization: true,
  },
};
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// Public Routes (no auth or location middleware)
app.use('/api/public', publicRoutes);

// Global Auth Middleware (Protects all routes below this point)
app.use(authMiddleware);

// Global Location Middleware (Ensures JWT contains location_id)
app.use(locationMiddleware);

// Protected Routes
app.use('/api/shops', shopRoutes);
app.use('/api/admin/shops', shopAdminRoutes);
app.use('/api', shopVisibilityRoutes);
app.use('/api', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/shop/orders', orderAdminRoutes);
app.use('/api', publicProductRoutes);
app.use('/api/admin/service-categories', serviceCategoryRoutes);
app.use('/api/services', serviceRequestRoutes);
app.use('/api/services', serviceOfferRoutes);
app.use('/api/admin/services', serviceAdminRoutes);
app.use('/api', serviceHistoryRoutes);
app.use('/api/admin/events', eventAdminRoutes);
app.use('/api/events', eventUserRoutes);
app.use('/api/admin/event-registrations', eventRegistrationAdminRoutes);
app.use('/api/admin/news', localNewsAdminRoutes);
app.use('/api/news', localNewsUserRoutes);
app.use('/api/enquire', enquireUserRoutes);
app.use('/api/admin/enquire', enquireAdminRoutes);
app.use('/api/admin/contests', contestAdminRoutes);
app.use('/api/contests', contestUserRoutes);
app.use('/api/contests', contestVoteRoutes);
app.use('/api/contests', contestLeaderboardRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/mobile/shops', mobileShopRoutes);
app.use('/api/mobile', mobileProductRoutes);
app.use('/api/mobile/cart', mobileCartRoutes);
app.use('/api/mobile/orders', mobileOrderRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const requestId = req.request_id || req.get('X-Request-Id');
  const isProduction = process.env.NODE_ENV === 'production';

  const response = {
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: isProduction ? 'Internal Server Error' : err.message || 'Internal Server Error',
      request_id: requestId,
    },
  };

  const logPayload = {
    level: 'error',
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    error_name: err.name,
    error_message: err.message,
    user_id: req.user ? req.user.user_id : undefined,
    location_id: req.user ? req.user.location_id : undefined,
  };

  console.error(JSON.stringify(logPayload));

  res.status(status).json(response);
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Manacity API running on http://${HOST}:${PORT}`);
  startServiceExpiryJob();
});
