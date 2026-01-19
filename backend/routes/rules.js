const express = require('express');
const { RulesController } = require('../controllers/rulesController');
const { AuthController } = require('../controllers/authController');
const { securityMiddleware } = require('../middleware/security');

const router = express.Router();

// All rules routes require authentication
router.use(AuthController.verifyToken);

// GET /api/rules/:accountId
router.get('/:accountId',
  RulesController.getRulesByAccount
);

// POST /api/rules/create
router.post('/create',
  securityMiddleware.validateInput({
    accountId: require('joi').number().required(),
    ruleName: require('joi').string().required().max(255),
    ruleType: require('joi').string().valid(
      'date_tolerance', 'amount_tolerance', 'description_pattern', 
      'auto_match', 'ignore_keywords'
    ).required(),
    ruleConfig: require('joi').object().required(),
    businessJustification: require('joi').string().required().max(1000),
    priority: require('joi').number().min(1).max(100).optional()
  }),
  RulesController.createRule
);

// PUT /api/rules/update/:id
router.put('/update/:id',
  securityMiddleware.validateInput({
    ruleName: require('joi').string().optional().max(255),
    ruleConfig: require('joi').object().optional(),
    businessJustification: require('joi').string().optional().max(1000),
    priority: require('joi').number().min(1).max(100).optional(),
    isActive: require('joi').boolean().optional()
  }),
  RulesController.updateRule
);

// DELETE /api/rules/:id
router.delete('/:id',
  RulesController.deleteRule
);

// GET /api/rules/:id/test - Test rule against sample data
router.get('/:id/test',
  RulesController.testRule
);

// POST /api/rules/:accountId/bulk-create - Create multiple rules
router.post('/:accountId/bulk-create',
  securityMiddleware.validateInput({
    rules: require('joi').array().items(
      require('joi').object({
        ruleName: require('joi').string().required(),
        ruleType: require('joi').string().required(),
        ruleConfig: require('joi').object().required(),
        businessJustification: require('joi').string().required()
      })
    ).required()
  }),
  RulesController.bulkCreateRules
);

module.exports = router;