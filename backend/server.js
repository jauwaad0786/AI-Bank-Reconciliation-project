const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { initRedis, getRedis } = require('./config/redis');
const { securityMiddleware } = require('./middleware/security');
const { performanceMonitor } = require('./config/performance');
const { SystemPerformanceLog, setupDatabase, sequelize } = require('./models');
const apiRoutes = require('./routes');

const PORT = process.env.PORT || 5000;
const app = express();
app.set('trust proxy', 1);

// =======================
// MIDDLEWARE
// =======================

// ✅ Helmet middleware
app.use(securityMiddleware.helmet);

// ✅ Wrap XSS protection so Express gets a function
app.use((req, res, next) => securityMiddleware.xssProtection(req, res, next));

// ✅ Dynamic CORS fix → allow any localhost:* origin
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith("http://localhost:")) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed for: " + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

app.use(morgan('combined'));
app.use(compression());
app.use(performanceMonitor.responseTime);
app.use(cookieParser());

// ✅ FIXED: Strict JSON verify hata diya
app.use(express.json({ limit: '10mb', strict: false }));

// ✅ URL-encoded parsing safe
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =======================
// STATIC FILES
// =======================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =======================
// API ROUTES
// =======================
app.use('/api', apiRoutes);

// =======================
// HEALTH & TEST ROUTES
// =======================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Bank Reconciliation API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  });
});

app.get('/api/test', (req, res) => {
  res.json({
    message: 'API is working correctly!',
    timestamp: new Date().toISOString(),
  });
});

// =======================
// ERROR HANDLING
// =======================
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);

  if (SystemPerformanceLog) {
    SystemPerformanceLog.create({
      operationType: 'UNHANDLED_ERROR',
      durationMs: 0,
      status: 'error',
      error_message: error.message,
      operation_details: {
        method: req.method,
        path: req.path,
        user_id: req.user?.id,
      },
    }).catch(console.error);
  }

  res.status(500).json({
    error: 'Internal server error',
    requestId: crypto.randomUUID(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: 'API endpoint not found',
    requestedUrl: req.originalUrl,
    method: req.method,
  });
});

// =======================
// SERVER START
// =======================
const startServer = async () => {
  try {
    console.log('🔄 Setting up database...');

    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync();
      console.log('✅ Database tables synced (safe)');
    } else {
      await setupDatabase();
    }

    console.log('✅ Database connected');

    try {
      await initRedis();
    } catch (err) {
      console.error('❌ Redis init failed (production requires Redis):', err);
      if (process.env.NODE_ENV === 'production') process.exit(1);
    }

    if (process.env.NODE_ENV === 'production' && cluster.isPrimary) {
      const numCPUs = os.cpus().length;
      for (let i = 0; i < numCPUs; i++) cluster.fork();
      cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting…`);
        cluster.fork();
      });
    } else {
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
      });
    }
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
};

// =======================
// UNHANDLED REJECTIONS
// =======================
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

// =======================
// GRACEFUL SHUTDOWN
// =======================
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');

  const redisClient = getRedis();
  if (redisClient && redisClient.isOpen) await redisClient.quit().catch(console.error);
  if (sequelize) await sequelize.close().catch(console.error);

  process.exit(0);
});

startServer();
