const express = require("express");
const { ReconciliationController } = require("../controllers/reconciliationController");
const { AuthController } = require("../controllers/authController");
const { securityMiddleware } = require("../middleware/security");
const Joi = require("joi");
const { spawn } = require("child_process");
const path = require("path");

const router = express.Router();

// 🔒 All reconciliation routes require authentication
router.use((req, res, next) => {
  console.log(`🔐 Auth check for: ${req.method} ${req.path}`);
  console.log(`   Headers present: ${!!req.headers.authorization}`);
  next();
});

router.use(AuthController.verifyToken);

// 🆕 CRITICAL: Export routes MUST be BEFORE /:accountId route to avoid conflicts
router.get("/export/matched/:accountId", ReconciliationController.exportMatched);
router.get("/export/unmatched-bank/:accountId", ReconciliationController.exportUnmatchedBank);
router.get("/export/unmatched-book/:accountId", ReconciliationController.exportUnmatchedBook);
router.get('/export/anomalies/:accountId', ReconciliationController.exportAnomalies);
router.get("/:accountId/export/vendor-outliers", ReconciliationController.exportVendorOutliers);
router.get("/:accountId/export/missing-data", ReconciliationController.exportMissingData);

// -----------------
// Compatibility mirrors (minimal, safe additions)
// Add accountId-first mirrors for export-first routes so requests like
// /api/reconciliation/1/export/matched also work (old frontend / alternate clients).
// These are intentionally added BEFORE the main "/:accountId" POST route.
router.get("/:accountId/export/matched", ReconciliationController.exportMatched);
router.get("/:accountId/export/unmatched-bank", ReconciliationController.exportUnmatchedBank);
router.get("/:accountId/export/unmatched-book", ReconciliationController.exportUnmatchedBook);
router.get("/:accountId/export/anomalies", ReconciliationController.exportAnomalies);

// Also add export-first mirrors for vendor-outliers & missing-data (optional but harmless)
// so both styles are fully supported.
router.get("/export/vendor-outliers/:accountId", ReconciliationController.exportVendorOutliers);
router.get("/export/missing-data/:accountId", ReconciliationController.exportMissingData);
// -----------------

// ✅ Start reconciliation (simple + AI)
router.post(
  "/start",
  securityMiddleware.heavyOperationLimit,
  securityMiddleware.validateInput({
    accountId: Joi.number().required(),
    periodFrom: Joi.date().required(),
    periodTo: Joi.date().required(),
    bankFileId: Joi.number().optional(),
    ledgerFileId: Joi.number().optional(),
    sessionName: Joi.string().required().max(255),
  }),
  ReconciliationController.startReconciliation
);

// ✅ Check reconciliation status
router.get("/status/:id", ReconciliationController.getReconciliationStatus);

// ✅ Fetch reconciliation results
router.get("/results/:id", ReconciliationController.getReconciliationResults);

// ✅ Manual match creation
router.post(
  "/manual-match",
  securityMiddleware.validateInput({
    bankTransactionId: Joi.number().required(),
    bookTransactionId: Joi.number().required(),
    reconciliationSessionId: Joi.number().required(),
    notes: Joi.string().optional().max(1000),
  }),
  ReconciliationController.createManualMatch
);

// ✅ Unmatch transactions
router.put(
  "/unmatch",
  securityMiddleware.validateInput({
    matchId: Joi.number().required(),
    reason: Joi.string().required().max(500),
  }),
  ReconciliationController.unmatchTransactions
);

// ✅ List reconciliation sessions
router.get("/sessions", ReconciliationController.listSessions);

// ✅ Get exceptions for a reconciliation session
router.get("/:id/exceptions", ReconciliationController.getExceptions);

// ✅ Approve reconciliation session
router.post(
  "/:id/approve",
  securityMiddleware.validateInput({
    approvalNotes: Joi.string().optional().max(1000),
  }),
  ReconciliationController.approveSession
);

// 🔥 AI-based reconciliation & analytics
router.post(
  "/analyze/:accountId",
  (req, res, next) => {
    console.log("🎯 Route hit: /analyze/:accountId");
    console.log("   accountId:", req.params.accountId);
    console.log("   User:", req.user?.id);
    next();
  },
  securityMiddleware.heavyOperationLimit,
  ReconciliationController.reconcileAndAnalyze
);

// 🔥 Backward compatibility (old frontend) - THIS IS YOUR MAIN ROUTE
router.post(
  "/:accountId",
  (req, res, next) => {
    console.log("🎯 Route hit: /:accountId");
    console.log("   accountId:", req.params.accountId);
    console.log("   User:", req.user?.id);
    console.log("   Body:", JSON.stringify(req.body, null, 2));
    next();
  },
  securityMiddleware.heavyOperationLimit,
  ReconciliationController.reconcileAndAnalyze
);

// 🔥 Export reconciliation results (CSV/Excel/PDF) - Keep at end
router.get("/:id/export", ReconciliationController.exportResults);

// ✅ Python test route
router.get("/check-python", async (req, res) => {
  console.log("🐍 Testing Python installation...");
  try {
    const pythonCmd =
      process.env.PYTHON_PATH ||
      (process.platform === "win32" ? "python" : "python3");
    
    console.log("   Python command:", pythonCmd);
    
    const script = path.join(process.cwd(), "ai/test.py");
    console.log("   Script path:", script);

    const py = spawn(pythonCmd, [script]);

    let output = "";
    let errorOutput = "";

    py.stdout.on("data", (data) => {
      const chunk = data.toString();
      console.log("   [PYTHON-OUT]", chunk);
      output += chunk;
    });

    py.stderr.on("data", (data) => {
      const chunk = data.toString();
      console.log("   [PYTHON-ERR]", chunk);
      errorOutput += chunk;
    });

    py.on("close", (code) => {
      console.log("   Python exit code:", code);
      if (code !== 0) {
        return res.status(500).json({
          success: false,
          message: "Python process failed",
          error: errorOutput,
          pythonCmd,
          scriptPath: script
        });
      }
      try {
        const result = JSON.parse(output.trim());
        console.log("   ✅ Python test successful");
        res.json(result);
      } catch (err) {
        console.error("   ❌ Failed to parse Python output");
        res.status(500).json({
          success: false,
          message: "Invalid JSON from Python",
          raw: output,
          parseError: err.message
        });
      }
    });

    py.on("error", (err) => {
      console.error("   ❌ Python spawn error:", err.message);
      res.status(500).json({
        success: false,
        message: "Failed to spawn Python process",
        error: err.message,
        pythonCmd
      });
    });
  } catch (err) {
    console.error("   ❌ Route error:", err.message);
    res.status(500).json({
      success: false,
      message: "Node route error",
      error: err.message,
      stack: err.stack
    });
  }
});

module.exports = router;
