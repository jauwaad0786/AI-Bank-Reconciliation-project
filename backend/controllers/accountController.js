const { Account } = require("../models");

const AccountController = {
  async createAccount(req, res) {
    try {
      const { accountName, bankName, accountNumber, accountType } = req.body;

      if (!accountName || !bankName || !accountNumber) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const account = await Account.create({
        accountName,
        bankName,
        accountNumber,
        accountType: accountType || "current",
        createdBy: req.user?.id || null,
      });

      res.json({ success: true, account });
    } catch (error) {
      console.error("❌ Account create error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  },

  async listAccounts(req, res) {
    try {
      const accounts = await Account.findAll({
        where: { isActive: true },
        order: [["createdAt", "DESC"]],
      });
      res.json({ success: true, accounts });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  }
};

module.exports = { AccountController };
