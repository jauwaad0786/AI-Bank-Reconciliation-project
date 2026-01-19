const express = require("express");
const { AccountController } = require("../controllers/accountController");
const { AuthController } = require("../controllers/authController");

const router = express.Router();

router.use(AuthController.verifyToken); // user must be logged in

router.post("/create", AccountController.createAccount);
router.get("/list", AccountController.listAccounts);

module.exports = router;
