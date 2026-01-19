const express = require('express');
const { ReportsController } = require('../controllers/reportsController');
const { AuthController } = require('../controllers/authController');
const { securityMiddleware } = require('../middleware/security');

const router = express.Router();

// All reports routes require authentication
router.use(AuthController.verifyToken);

// GET /api/reports/summary
router.get('/summary',
  securityMiddleware.validateInput({
    accountId: require('joi').number().optional(),
    periodFrom: require('joi').date().optional(),
    periodTo: require('joi').date().optional(),
    sessionId: require('joi').number().optional()
  }),
  ReportsController.getSummaryReport
);

// GET /api/reports/exceptions
router.get('/exceptions',
  securityMiddleware.validateInput({
    accountId: require('joi').number().optional(),
    severity: require('joi').string().valid('low', 'medium', 'high').optional(),
    status: require('joi').string().valid('pending', 'resolved', 'ignored').optional(),
    sessionId: require('joi').number().optional()
  }),
  ReportsController.getExceptionsReport
);

// GET /api/reports/audit-trail
router.get('/audit-trail',
  securityMiddleware.validateInput({
    userId: require('joi').number().optional(),
    entityType: require('joi').string().optional(),
    action: require('joi').string().optional(),
    dateFrom: require('joi').date().optional(),
    dateTo: require('joi').date().optional(),
    regulationImpact: require('joi').string().valid('sox', 'gdpr', 'aml', 'tax', 'none').optional()
  }),
  ReportsController.getAuditTrail
);

// POST /api/reports/export
router.post('/export',
  securityMiddleware.heavyOperationLimit,
  securityMiddleware.validateInput({
    reportType: require('joi').string().valid('summary', 'detailed', 'exceptions', 'audit').required(),
    format: require('joi').string().valid('pdf', 'excel', 'csv').required(),
    sessionId: require('joi').number().optional(),
    accountId: require('joi').number().optional(),
    parameters: require('joi').object().optional()
  }),
  ReportsController.exportReport
);

// GET /api/reports/dashboard - Dashboard statistics
router.get('/dashboard',
  ReportsController.getDashboardStats
);

// GET /api/reports/performance - Performance metrics
router.get('/performance',
  ReportsController.getPerformanceMetrics
);

// GET /api/reports/compliance - Compliance status
router.get('/compliance',
  ReportsController.getComplianceStatus
);

module.exports = router;