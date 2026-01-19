const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const Joi = require('joi');

// Enhanced Security Middleware
const securityMiddleware = {
  // Helmet for security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),

  // Rate limiting for login/auth routes
  authRateLimit: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: {
      error: 'Too many login attempts, please try again later',
      retryAfter: '15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),

  // General API rate limiting
  apiRateLimit: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: {
      error: 'Too many requests, please slow down',
      retryAfter: '1 minute',
    },
  }),

  // Heavy operation limit (like reconciliation/AI)
  heavyOperationLimit: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10,
    message: {
      error: 'Too many heavy operations, please wait',
      retryAfter: '5 minutes',
    },
  }),

  // Speed limiter for abusive clients
  speedLimiter: slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 5,
    delayMs: () => 500,
    maxDelayMs: 20000,
  }),

  // ✅ Joi schema validation middleware
  validateInput: (schema) => {
    return (req, res, next) => {
      const { error } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
        });
      }
      next();
    };
  },

  // ✅ Custom XSS protection middleware
  xssProtection: (req, res, next) => {
    const sanitizeInput = (obj) => {
      for (let key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key]
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '');
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeInput(obj[key]);
        }
      }
    };

    if (req.body) sanitizeInput(req.body);
    if (req.query) sanitizeInput(req.query);
    if (req.params) sanitizeInput(req.params);

    next();
  },
};

module.exports = { securityMiddleware };
