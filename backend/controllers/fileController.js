// backend/controllers/fileController.js - 
// Controller for handling file uploads (bank statements, ledgers), processing, and management

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const XLSX = require("xlsx");
const {
  UploadedFile,
  BankTransaction,
  BookTransaction,
  Account,
} = require("../models");

function safeDate(value) {
  if (!value || value === '' || value === 'null' || value === 'undefined') return null;
  
  let dateObj;
  
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    dateObj = new Date(excelEpoch.getTime() + value * 86400000);
  } else {
    const str = String(value).trim();
    
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      dateObj = new Date(str + 'T00:00:00');
    }
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
      const [month, day, year] = str.split('/').map(Number);
      dateObj = new Date(year, month - 1, day);
    }
    else if (/^\d{1,2}-\d{1,2}-\d{4}/.test(str)) {
      const [day, month, year] = str.split('-').map(Number);
      dateObj = new Date(year, month - 1, day);
    }
    else {
      dateObj = new Date(str);
    }
  }
  
  if (!dateObj || isNaN(dateObj.getTime())) return null;
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

function parseAmount(value) {
  if (!value || value === '' || value === 'null') return 0;
  let str = String(value).trim();
  const isNegative = str.includes('(') && str.includes(')');
  str = str.replace(/[^\d.-]/g, '');
  let amount = parseFloat(str) || 0;
  if (isNegative && amount > 0) amount = -amount;
  return amount;
}

//  CLEANUP FUNCTION - Delete old data before upload
async function cleanupOldData(accountId, fileType) {
  try {
    console.log(`🧹 Cleaning up old ${fileType} data for account ${accountId}...`);
    
    if (fileType === "bank_statement") {
      // Delete old bank transactions
      const deleted = await BankTransaction.destroy({
        where: { accountId }
      });
      console.log(`✅ Deleted ${deleted} old bank transactions`);
      
      // Delete old uploaded file records for bank statements
      await UploadedFile.destroy({
        where: { 
          accountId,
          fileType: "bank_statement"
        }
      });
      
    } else if (fileType === "ledger") {
      // Delete old book transactions
      const deleted = await BookTransaction.destroy({
        where: { accountId }
      });
      console.log(`✅ Deleted ${deleted} old book transactions`);
      
      // Delete old uploaded file records for ledgers
      await UploadedFile.destroy({
        where: { 
          accountId,
          fileType: "ledger"
        }
      });
    }
    
    console.log(`✅ Cleanup completed for ${fileType}`);
    return true;
    
  } catch (err) {
    console.error(`❌ Cleanup error for ${fileType}:`, err);
    throw err;
  }
}

const FileController = {
  uploadBankStatement: async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const { originalname, filename, path: filePath, size } = req.file;
      const fileExt = path.extname(originalname).toLowerCase().replace(".", "");
      
      console.log(`📤 BANK UPLOAD: ${originalname}, ext=${fileExt}, path=${filePath}`);

      const accountId = req.body.accountId;
      if (!accountId) return res.status(400).json({ error: "accountId is required" });
      
      const account = await Account.findByPk(accountId);
      if (!account) return res.status(404).json({ error: `Account ${accountId} not found` });

      //  CLEANUP OLD DATA FIRST
      await cleanupOldData(accountId, "bank_statement");

      const uploaded = await UploadedFile.create({
        accountId,
        uploadedBy: req.user?.id || 1,
        originalFilename: originalname,
        storedFilename: filename,
        filePath,
        fileSize: size,
        fileType: "bank_statement",
        fileFormat: fileExt,
        processingStatus: "processing",
      });

      return await FileController.processFile(req, res, uploaded, filePath, fileExt, "bank_statement");
    } catch (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({ error: "File upload failed", details: err.message });
    }
  },

  uploadLedger: async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const { originalname, filename, path: filePath, size } = req.file;
      const fileExt = path.extname(originalname).toLowerCase().replace(".", "");
      
      console.log(`📤 LEDGER UPLOAD: ${originalname}, ext=${fileExt}, path=${filePath}`);

      const accountId = req.body.accountId;
      if (!accountId) return res.status(400).json({ error: "accountId is required" });
      
      const account = await Account.findByPk(accountId);
      if (!account) return res.status(404).json({ error: `Account ${accountId} not found` });

      //     CLEANUP OLD DATA FIRST
      await cleanupOldData(accountId, "ledger");

      const uploaded = await UploadedFile.create({
        accountId,
        uploadedBy: req.user?.id || 1,
        originalFilename: originalname,
        storedFilename: filename,
        filePath,
        fileSize: size,
        fileType: "ledger",
        fileFormat: fileExt,
        processingStatus: "processing",
      });

      return await FileController.processFile(req, res, uploaded, filePath, fileExt, "ledger");
    } catch (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({ error: "File upload failed", details: err.message });
    }
  },

  processFile: async (req, res, uploaded, filePath, fileExt, fileType) => {
    console.log(`🔄 Processing ${fileType}: ext=${fileExt}`);
    
    try {
      if (fileExt === "xlsx" || fileExt === "xls" || fileExt === "xlsm") {
        console.log(`📊 Using EXCEL parser`);
        return await FileController.parseExcel(req, res, uploaded, filePath, fileType);
      }
      
      if (fileExt === "csv") {
        console.log(`📄 Using CSV parser`);
        return await FileController.parseCSV(req, res, uploaded, filePath, fileType);
      }
      
      throw new Error(`Unsupported file format: ${fileExt}`);
      
    } catch (error) {
      console.error(`❌ Processing error:`, error);
      await uploaded.update({ processingStatus: "failed" });
      return res.status(500).json({ error: "File processing failed", details: error.message });
    }
  },

  parseExcel: async (req, res, uploaded, filePath, fileType) => {
    try {
      const workbook = XLSX.readFile(filePath);
      console.log(`📊 Sheets: ${workbook.SheetNames.join(', ')}`);
      
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(worksheet, { 
        raw: true,
        defval: ''
      });
      
      console.log(`📊 Raw rows: ${rawData.length}`);
      if (rawData.length > 0) {
        console.log(`📊 Columns: ${Object.keys(rawData[0]).join(', ')}`);
        console.log(`📊 Sample:`, JSON.stringify(rawData[0]).substring(0, 200));
      }
      
      if (rawData.length === 0) {
        throw new Error("No data in Excel file");
      }
      
      const detectColumn = (row, keywords) => {
        for (const key of Object.keys(row)) {
          const keyLower = String(key).toLowerCase();
          if (keywords.some(kw => keyLower.includes(kw))) return key;
        }
        return null;
      };
      
      const sampleRow = rawData[0];
      const dateCol = detectColumn(sampleRow, ["date", "txn date", "transaction date"]);
      const amountCol = detectColumn(sampleRow, ["amount", "amt"]);
      const descCol = detectColumn(sampleRow, ["desc", "memo", "narration", "particulars"]);
      const refCol = detectColumn(sampleRow, ["ref", "reference", "id", "utr"]);
      const vendorCol = detectColumn(sampleRow, ["vendor", "account full name", "name"]);
      
      console.log(`📊 Detected: date=${dateCol}, amount=${amountCol}, desc=${descCol}`);
      
      const rows = [];
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        
        const desc = descCol ? String(row[descCol] || "") : "";
        if (desc.includes("Opening Balance") || desc.includes("Checking")) continue;
        
        const dateVal = dateCol ? row[dateCol] : null;
        const parsedDate = safeDate(dateVal);
        
        if (i < 3) {
          console.log(`🔍 Row ${i + 2}: Original date="${dateVal}", Parsed="${parsedDate}"`);
        }
        
        if (!parsedDate) continue;
        
        const amount = parseAmount(amountCol ? row[amountCol] : 0);
        if (amount === 0) continue;
        
        const description = desc || "Unknown";
        const reference = refCol ? String(row[refCol] || "") : "";
        
        const rowData = {
          accountId: uploaded.accountId,
          uploadedFileId: uploaded.id,
          rowNumber: i + 2,
          date: parsedDate,
          description: description.substring(0, 500).trim(),
          amount: amount,
          originalAmount: amount,
          currency: "INR",
          adjustmentAmount: 0,
          isSuspicious: false,
          status: "pending",
          dataClassification: "confidential",
          createdBy: req.user?.id || 1,
          updatedBy: null,
        };
        
        if (fileType === "bank_statement") {
          rows.push({
            ...rowData,
            referenceNumber: reference,
            transactionType: amount >= 0 ? "Credit" : "Debit",
            counterpartyName: null,
          });
        } else {
          rows.push({
            ...rowData,
            reference: reference,
            vendorName: vendorCol ? String(row[vendorCol] || "").substring(0, 255) : "",
            invoiceNumber: null,
            category: null,
            subcategory: null,
          });
        }
      }

      console.log(`✅ Processed: ${rows.length} valid rows`);

      if (rows.length > 0) {
        if (fileType === "bank_statement") {
          await BankTransaction.bulkCreate(rows);
        } else {
          await BookTransaction.bulkCreate(rows);
        }
      }

      await uploaded.update({
        totalRows: rows.length,
        processedRows: rows.length,
        processingStatus: "completed",
      });

      return res.json({
        success: true,
        message: `${fileType} uploaded`,
        file: uploaded,
        processingResults: { 
          totalProcessed: rows.length,
          method: "excel",
          cleanupPerformed: true
        },
      });
    } catch (error) {
      console.error(`❌ Excel parse error:`, error);
      throw error;
    }
  },

  parseCSV: async (req, res, uploaded, filePath, fileType) => {
    return new Promise((resolve) => {
      const rows = [];
      let rowCount = 0;
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          rowCount++;
          
          const date = row.Date || row['Transaction date'];
          const description = row.Description || row['Memo/Description'] || "Unknown";
          const amount = parseAmount(row.Amount);
          const vendor = row['Account full name'] || "";
          
          const parsedDate = safeDate(date);
          
          if (rowCount <= 3) {
            console.log(`🔍 CSV Row ${rowCount}: Original="${date}", Parsed="${parsedDate}"`);
          }
          
          if (!amount || !parsedDate) return;
          
          const baseRow = {
            accountId: uploaded.accountId,
            uploadedFileId: uploaded.id,
            rowNumber: rowCount,
            date: parsedDate,
            description: String(description).substring(0, 500),
            amount: amount,
            originalAmount: amount,
            currency: "INR",
            adjustmentAmount: 0,
            isSuspicious: false,
            status: "pending",
            dataClassification: "confidential",
            createdBy: req.user?.id || 1,
            updatedBy: null,
          };
          
          if (fileType === "bank_statement") {
            rows.push({
              ...baseRow,
              referenceNumber: null,
              transactionType: amount >= 0 ? "Credit" : "Debit",
              counterpartyName: null,
            });
          } else {
            rows.push({
              ...baseRow,
              reference: null,
              vendorName: vendor,
              invoiceNumber: null,
              category: null,
              subcategory: null,
            });
          }
        })
        .on("end", async () => {
          console.log(`✅ CSV parsed: ${rows.length} rows`);
          
          try {
            if (rows.length > 0) {
              if (fileType === "bank_statement") {
                await BankTransaction.bulkCreate(rows);
              } else {
                await BookTransaction.bulkCreate(rows);
              }
            }

            await uploaded.update({
              totalRows: rows.length,
              processedRows: rows.length,
              processingStatus: "completed",
            });

            resolve(res.json({
              success: true,
              message: `${fileType} uploaded`,
              file: uploaded,
              processingResults: { 
                totalProcessed: rows.length,
                method: "csv",
                cleanupPerformed: true
              },
            }));
          } catch (err) {
            console.error("❌ DB error:", err);
            await uploaded.update({ processingStatus: "failed" });
            resolve(res.status(500).json({ error: "DB insert failed", details: err.message }));
          }
        })
        .on("error", async (err) => {
          console.error("❌ CSV error:", err);
          await uploaded.update({ processingStatus: "failed" });
          resolve(res.status(500).json({ error: "CSV parsing failed", details: err.message }));
        });
    });
  },

  // ... rest of the controller methods remain same
  
  checkAndStartAutoReconciliation: async (accountId) => {
    try {
      const parsedAccountId = parseInt(accountId, 10);
      const bankCount = await BankTransaction.count({ where: { accountId: parsedAccountId } });
      const bookCount = await BookTransaction.count({ where: { accountId: parsedAccountId } });

      if (bankCount > 0 && bookCount > 0) {
        const { ReconciliationController } = require("./reconciliationController");
        const mockReq = { params: { accountId: parsedAccountId.toString() }, user: { id: 1 } };
        const mockRes = {
          json: () => {},
          status: () => ({ json: () => {} }),
        };
        await ReconciliationController.reconcileAndAnalyze(mockReq, mockRes);
      }
    } catch (err) {
      console.error("Auto reconciliation error:", err.message);
    }
  },

  listFiles: async (req, res) => {
    try {
      const files = await UploadedFile.findAll({
        where: { uploadedBy: req.user?.id },
        order: [["createdAt", "DESC"]],
      });
      res.json({ success: true, files });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch files" });
    }
  },

  downloadFile: async (req, res) => {
    try {
      const file = await UploadedFile.findByPk(req.params.id);
      if (!file) return res.status(404).json({ error: "File not found" });
      res.download(file.filePath, file.originalFilename);
    } catch {
      res.status(500).json({ error: "Download failed" });
    }
  },

  getProcessingStatus: async (req, res) => {
    try {
      const file = await UploadedFile.findByPk(req.params.id);
      if (!file) return res.status(404).json({ error: "File not found" });
      res.json({
        id: file.id,
        status: file.processingStatus,
        totalRows: file.totalRows,
        processedRows: file.processedRows,
      });
    } catch {
      res.status(500).json({ error: "Failed to get status" });
    }
  },

  deleteFile: async (req, res) => {
    try {
      const file = await UploadedFile.findByPk(req.params.id);
      if (!file) return res.status(404).json({ error: "File not found" });

      if (file.fileType === "bank_statement") {
        await BankTransaction.destroy({ where: { uploadedFileId: file.id } });
      } else {
        await BookTransaction.destroy({ where: { uploadedFileId: file.id } });
      }

      if (fs.existsSync(file.filePath)) fs.unlinkSync(file.filePath);
      await file.destroy();
      res.json({ success: true, message: "File deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete file" });
    }
  },
};

module.exports = FileController;