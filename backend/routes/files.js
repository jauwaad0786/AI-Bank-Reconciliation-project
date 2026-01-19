const express = require('express');
const multer = require('multer');
const path = require('path');
const FileController = require('../controllers/fileController');
const { AuthController } = require('../controllers/authController');
const { securityMiddleware } = require('../middleware/security');

const router = express.Router();

// Debug: ensure FileController functions exist
console.log("✅ FileController methods:", Object.keys(FileController));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.pdf'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, XLSX, XLS, and PDF files are allowed.'), false);
    }
  }
});

// ✅ Optional: require auth for all routes
// router.use(AuthController.verifyToken);

/**
 * ============================
 * Upload Routes (/api/upload)
 * ============================
 */
router.post(
  '/bank-statement',
  securityMiddleware.heavyOperationLimit,
  upload.single('file'),
  FileController.uploadBankStatement || ((req,res)=>res.status(501).json({error:"uploadBankStatement not implemented"}))
);

router.post(
  '/ledger',
  securityMiddleware.heavyOperationLimit,
  upload.single('file'),
  FileController.uploadLedger || ((req,res)=>res.status(501).json({error:"uploadLedger not implemented"}))
);

/**
 * ============================
 * File Management (/api/files)
 * ============================
 */
router.get(
  '/mapping-template',
  FileController.getMappingTemplate || ((req,res)=>res.status(501).json({error:"getMappingTemplate not implemented"}))
);

router.get(
  '/list',
  FileController.listFiles || ((req,res)=>res.status(501).json({error:"listFiles not implemented"}))
);

router.get(
  '/:id/download',
  FileController.downloadFile || ((req,res)=>res.status(501).json({error:"downloadFile not implemented"}))
);

router.get(
  '/:id/status',
  FileController.getProcessingStatus || ((req,res)=>res.status(501).json({error:"getProcessingStatus not implemented"}))
);

router.delete(
  '/:id',
  FileController.deleteFile || ((req,res)=>res.status(501).json({error:"deleteFile not implemented"}))
);

module.exports = router;
