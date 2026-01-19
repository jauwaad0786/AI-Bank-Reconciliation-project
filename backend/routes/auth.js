const express = require('express');
const { AuthController, authSchemas } = require('../controllers/authController');
const { securityMiddleware } = require('../middleware/security');

const router = express.Router();

// POST /api/auth/login
router.post('/login', 
  securityMiddleware.validateInput(authSchemas.login),
  AuthController.login
);

// POST /api/auth/logout
router.post('/logout', 
  AuthController.verifyToken,
  AuthController.logout
);

// POST /api/auth/register
router.post('/register', 
  securityMiddleware.validateInput(authSchemas.register),
  AuthController.register
);

// // POST /api/auth/refresh
// router.post('/refresh', 
//   AuthController.refreshToken
// );

// GET /api/auth/verify - Check if token is valid
router.get('/verify', 
  AuthController.verifyToken,
  (req, res) => {
    res.json({ 
      valid: true, 
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        permissions: req.user.permissions
      }
    });
  }
);

// GET /api/auth/profile - Get user profile
// router.get('/profile', 
//   AuthController.verifyToken,
//   AuthController.getProfile
// );

// PUT /api/auth/change-password
// router.put('/change-password',
//   AuthController.verifyToken,
//   securityMiddleware.validateInput(authSchemas.changePassword),
//   AuthController.changePassword
// );

module.exports = router;