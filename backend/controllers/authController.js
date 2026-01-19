const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Joi = require("joi");
const { Op } = require("sequelize");
const { User, UserSession, AuditLog, SystemPerformanceLog } = require("../models");
const { getRedis } = require("../config/redis");

// Validation schemas
const authSchemas = {
  login: Joi.object({
    email: Joi.string().email().required().max(255),
    password: Joi.string().required().min(8).max(128),
    rememberMe: Joi.boolean().optional(),
  }),

  register: Joi.object({
    email: Joi.string().email().required().max(255),
    password: Joi.string()
      .required()
      .min(8)
      .max(128)
      .pattern(
        new RegExp(
          "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]"
        )
      ),
    firstName: Joi.string().required().min(2).max(100),
    lastName: Joi.string().required().min(2).max(100),
    role: Joi.string()
      .valid("admin", "finance_analyst", "finance_manager", "auditor")
      .required(),
    employeeId: Joi.string().optional().max(50),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .required()
      .min(8)
      .max(128)
      .pattern(
        new RegExp(
          "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]"
        )
      ),
  }),
};

class AuthController {
  // 🔹 Login
  static async login(req, res) {
    const startTime = Date.now();
    try {
      const { email, password, rememberMe } = req.body;

      const user = await User.findOne({
        where: { email: email.toLowerCase() },
        attributes: [
          "id",
          "email",
          "password_hash",
          "role",
          "is_active",
          "failed_login_attempts",
          "account_locked_until",
        ],
      });

      if (!user) {
        await bcrypt.compare(
          password,
          "$2b$12$dummy.hash.to.prevent.timing.attacks"
        );
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const plainUser = user.get({ plain: true });

      if (
        plainUser.account_locked_until &&
        new Date() < plainUser.account_locked_until
      ) {
        return res.status(423).json({
          error: "Account locked due to too many failed attempts",
          unlockTime: plainUser.account_locked_until,
        });
      }

      const isValidPassword = await bcrypt.compare(
        password,
        plainUser.password_hash
      );
      if (!isValidPassword) {
        const failedAttempts = (plainUser.failed_login_attempts || 0) + 1;
        const lockAccount = failedAttempts >= 5;

        await user.update({
          failed_login_attempts: failedAttempts,
          account_locked_until: lockAccount
            ? new Date(Date.now() + 30 * 60 * 1000)
            : null,
        });

        await AuditLog.create({
          user_id: plainUser.id,
          action: "LOGIN_FAILED",
          ipAddress: req.ip,
          entityType: "User",
          user_agent: req.get("User-Agent"),
          details: { failed_attempts: failedAttempts },
          regulation_impact: "security",
          sensitivity_level: "high",
        });

        return res
          .status(401)
          .json({ error: "Invalid credentials", attemptsRemaining: 5 - failedAttempts });
      }

      if (!plainUser.is_active) {
        return res.status(403).json({ error: "Account deactivated" });
      }

      await user.update({
        failed_login_attempts: 0,
        account_locked_until: null,
        last_login: new Date(),
      });

      const tokenPayload = {
        userId: plainUser.id,
        email: plainUser.email,
        role: plainUser.role,
        sessionId: crypto.randomUUID(),
      };

      const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: rememberMe ? "7d" : "1h",
        issuer: "bank-reconciliation-system",
        audience: "bank-reconciliation-users",
      });

      const refreshToken = jwt.sign(
        { userId: plainUser.id, sessionId: tokenPayload.sessionId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
      );

      const expiresAt = new Date(
        Date.now() +
          (rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000)
      );

      const session = await UserSession.create({
        userId: plainUser.id,
        tokenHash: crypto
          .createHash("sha256")
          .update(accessToken)
          .digest("hex"),
        expiresAt,
        ipAddress: req.ip,
        user_agent: req.get("User-Agent"),
        is_active: true,
      });

      const redisClient = getRedis();
      if (redisClient && redisClient.isOpen && process.env.USE_REDIS === "true") {
        await redisClient.setEx(
          `session:${tokenPayload.sessionId}`,
          rememberMe ? 7 * 24 * 60 * 60 : 60 * 60,
          JSON.stringify({
            userId: plainUser.id,
            role: plainUser.role,
            sessionId: session.id,
          })
        );
      }

      await AuditLog.create({
        user_id: plainUser.id,
        action: "LOGIN_SUCCESS",
        ipAddress: req.ip,
        entityType: "User",
        user_agent: req.get("User-Agent"),
        details: { login_duration: Date.now() - startTime },
        regulation_impact: "gdpr",
        sensitivity_level: "medium",
      });

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: rememberMe
          ? 7 * 24 * 60 * 60 * 1000
          : 60 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        user: {
          id: plainUser.id,
          email: plainUser.email,
          role: plainUser.role,
        },
        token: accessToken, // Added for frontend compatibility
        sessionId: tokenPayload.sessionId,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("Login error:", error);
      await SystemPerformanceLog.create({
        operationType: "AUTH_LOGIN_ERROR",
        durationMs: Date.now() - startTime,
        status: "error",
        error_message: error.message,
        operation_details: { email: req.body.email, error_type: error.name },
      });
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // 🔹 Register
  static async register(req, res) {
    // Keep your existing register function
    try {
      const { email, password, firstName, lastName, role, employeeId } = req.body;
      
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const user = await User.create({
        email: email.toLowerCase(),
        password_hash: hashedPassword,
        first_name: firstName,
        last_name: lastName,
        role,
        employee_id: employeeId,
        is_active: true,
      });

      await AuditLog.create({
        user_id: user.id,
        action: "USER_REGISTERED",
        ipAddress: req.ip,
        user_agent: req.get("User-Agent"),
        regulation_impact: "gdpr",
        sensitivity_level: "high",
      });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  }

  // 🔹 Verify Token MIDDLEWARE (for protecting routes)
  static async verifyToken(req, res, next) {
    try {
      const token =
        req.cookies?.accessToken ||
        req.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return res.status(401).json({ 
          error: "Authentication required",
          message: "No token provided" 
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const redisClient = getRedis();
      let sessionData = null;

      if (redisClient && redisClient.isOpen && process.env.USE_REDIS === "true") {
        const cachedSession = await redisClient.get(`session:${decoded.sessionId}`);
        if (!cachedSession) {
          return res.status(401).json({ 
            error: "Session expired",
            message: "Session not found in Redis" 
          });
        }
        sessionData = JSON.parse(cachedSession);
      } else {
        // Redis disabled → rely only on JWT
        sessionData = {
          userId: decoded.userId,
          role: decoded.role,
          sessionId: decoded.sessionId,
        };
      }

      // Attach user to request for downstream middleware/controllers
      req.user = { 
        id: sessionData.userId, 
        role: sessionData.role,
        email: decoded.email 
      };

      // Continue to next middleware
      next();
    } catch (error) {
      console.error("Token verification error:", error.message);
      return res.status(401).json({ 
        error: "Invalid token",
        message: error.message 
      });
    }
  }

  // 🔹 Verify Endpoint (for frontend auth checks - returns JSON response)
  static async verify(req, res) {
    try {
      const token =
        req.cookies?.accessToken ||
        req.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return res.status(200).json({ valid: false, message: "No token provided" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const redisClient = getRedis();
      let sessionData = null;

      if (redisClient && redisClient.isOpen && process.env.USE_REDIS === "true") {
        const cachedSession = await redisClient.get(`session:${decoded.sessionId}`);
        if (!cachedSession) {
          return res
            .status(200)
            .json({ valid: false, message: "Session not found or expired" });
        }
        sessionData = JSON.parse(cachedSession);
      } else {
        sessionData = {
          userId: decoded.userId,
          role: decoded.role,
          sessionId: decoded.sessionId,
        };
      }

      return res.json({ 
        valid: true, 
        user: {
          id: sessionData.userId,
          role: sessionData.role,
          email: decoded.email
        }
      });
    } catch (error) {
      console.error("Token verification error:", error);
      return res.status(200).json({ valid: false, message: "Invalid or expired token" });
    }
  }

  // 🔹 Logout
  static async logout(req, res) {
    try {
      const token = req.cookies.accessToken;
      const redisClient = getRedis();

      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        await UserSession.update(
          { is_active: false },
          {
            where: {
              token_hash: crypto.createHash("sha256").update(token).digest("hex"),
            },
          }
        );

        if (redisClient && redisClient.isOpen && process.env.USE_REDIS === "true") {
          await redisClient.del(`session:${decoded.sessionId}`);
        }

        await AuditLog.create({
          user_id: req.user?.id || decoded.userId,
          action: "LOGOUT",
          ipAddress: req.ip,
          user_agent: req.get("User-Agent"),
          regulation_impact: "gdpr",
          sensitivity_level: "low",
        });
      }

      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");

      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  }
}

module.exports = { AuthController, authSchemas };