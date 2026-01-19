const express = require("express");
const authRoutes = require("./auth");
const filesRoutes = require("./files");
const reconciliationRoutes = require("./reconciliation");

const router = express.Router();

// 🔹 Mount routes
router.use("/auth", authRoutes);
router.use("/files", filesRoutes);
router.use("/reconciliation", reconciliationRoutes);

// 🔹 Health endpoint
router.get("/", (req, res) => {
  res.json({
    message: "✅ Bank Reconciliation API v1.0.0",
    endpoints: {
      authentication: "/api/auth",
      fileOperations: "/api/files",
      reconciliation: "/api/reconciliation",
      rulesManagement: "/api/rules",   // enable later
      reports: "/api/reports",         // enable later
    },
    documentation: "/api/docs (coming soon)",
  });
});

module.exports = router;
