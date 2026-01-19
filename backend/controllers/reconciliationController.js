// backend/controllers/reconciliationController.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { BankTransaction, BookTransaction } = require("../models");

// Use Python from .env if provided, else fallback
const pythonCmd =
  process.env.PYTHON_PATH ||
  (process.platform === "win32" ? "python" : "python3");

const projectRoot = process.cwd();
const PYTHON_TIMEOUT_MS = parseInt(process.env.PYTHON_TIMEOUT_MS || "120000", 10);

// 🆕 CACHE FOR RECONCILIATION RESULTS
const reconciliationCache = new Map();

function getCacheKey(accountId) {
  return `reconciliation_${accountId}`;
}

/**
 * Run a python script with JSON input and return parsed JSON output
 */
async function runPython(scriptPath, inputData = {}) {
  return new Promise((resolve, reject) => {
    try {
      const abs = path.resolve(scriptPath);
      if (!fs.existsSync(abs)) {
        return reject(new Error(`Python script not found: ${abs}`));
      }
      scriptPath = abs;
    } catch (err) {
      return reject(err);
    }

    console.log("🚀 Running Python:", scriptPath);
    console.log("🐍 Python Command:", pythonCmd);
    console.log("📝 Input Data Keys:", Object.keys(inputData));

    const py = spawn(pythonCmd, [scriptPath], { 
      shell: false,
      windowsHide: true 
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    let timer = null;
    if (PYTHON_TIMEOUT_MS > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          py.kill("SIGKILL");
        } catch (_) {}
      }, PYTHON_TIMEOUT_MS);
    }

    py.stdout.on("data", (data) => {
      const chunk = data.toString();
      console.log(`[PY-OUT] ${chunk}`);
      stdout += chunk;
    });

    py.stderr.on("data", (data) => {
      const chunk = data.toString();
      console.error(`[PY-ERR] ${chunk}`);
      stderr += chunk;
    });

    py.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`Failed to start Python: ${err.message}`));
    });

    py.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) return reject(new Error(`Python timed out after ${PYTHON_TIMEOUT_MS} ms`));

      if (code !== 0) {
        return reject(new Error(stderr || `Python exited with code ${code}`));
      }

      try {
        const trimmed = stdout.trim();
        if (!trimmed) return reject(new Error("No output from Python"));

        const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        let candidate = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].startsWith("{") || lines[i].startsWith("[")) {
            candidate = lines[i];
            break;
          }
        }
        if (!candidate) candidate = trimmed;

        const parsed = JSON.parse(candidate);

        if (parsed.success === false) {
          return reject(new Error(parsed.error || "Python returned failure"));
        }

        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse JSON: ${e.message}\nStdout: ${stdout}\nStderr: ${stderr}`));
      }
    });

    try {
      const jsonData = JSON.stringify(inputData);
      console.log(`📦 Sending ${jsonData.length} bytes to Python`);
      
      py.stdin.write(jsonData, (err) => {
        if (err) {
          if (timer) clearTimeout(timer);
          reject(new Error("Failed to write to Python stdin: " + err.message));
        }
      });
      py.stdin.end();
    } catch (e) {
      if (timer) clearTimeout(timer);
      reject(new Error("Failed to send input to Python: " + e.message));
    }
  });
}

/**
 * Helper function to clean numeric strings and parse floats
 */
function parseNumberFromString(s) {
  if (s === null || s === undefined) return null;
  const cleaned = String(s).replace(/[^\d.,\-]/g, "").replace(/,/g, "");
  if (cleaned === "") return null;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Attempt to extract vendor stats (mean/std/z/dev%) from
 * anomaly object or its reasons text (best-effort)
 */
function extractStatsFromAnomaly(anom) {
  let vendor_mean = anom.vendor_mean || anom.Vendor_Average || anom.vendor_average || null;
  let vendor_std = anom.vendor_std || anom.Std_Deviation || anom.vendor_std || null;
  let z_score = anom.z_score || anom.Z_Score || null;
  let deviation_pct = anom.deviation_percent || anom.Deviation_Percentage || null;

  const reasons = anom.reasons ?? anom.reasons_text ?? anom.reasonsText ?? "";
  const joinedReasons = Array.isArray(reasons) ? reasons.join(" | ") : String(reasons || "");

  if (!vendor_mean) {
    // search for "Vendor Average" or "Vendor Average: ₹1234.56"
    const m = joinedReasons.match(/Vendor\s*Average[:\s]*[^\d\-.,]*([0-9,]+\.\d+|[0-9,]+)/i);
    if (m) vendor_mean = parseNumberFromString(m[1]);
  }
  if (!vendor_std) {
    const m = joinedReasons.match(/Std(?:\.|ard)?\s*Deviation[:\s]*[^\d\-.,]*([0-9,]+\.\d+|[0-9,]+)/i);
    if (m) vendor_std = parseNumberFromString(m[1]);
  }
  if (!z_score) {
    const m = joinedReasons.match(/([0-9]+(?:\.[0-9]+)?)\s*σ|([0-9]+(?:\.[0-9]+)?)\s*sig(?:ma)?/i);
    if (m) z_score = parseNumberFromString(m[1] || m[2]);
  }
  if (!deviation_pct) {
    const m = joinedReasons.match(/Deviation[:\s]*([0-9]+(?:\.[0-9]+)?)%/i) || joinedReasons.match(/([0-9]+(?:\.[0-9]+)?)% from typical/i);
    if (m) deviation_pct = parseNumberFromString(m[1]);
  }

  return {
    vendor_mean: vendor_mean === null ? "" : vendor_mean,
    vendor_std: vendor_std === null ? "" : vendor_std,
    z_score: z_score === null ? "" : z_score,
    deviation_pct: deviation_pct === null ? "" : deviation_pct
  };
}

/**
 * Helper function to produce CSV with proper escaping and UTF-8 BOM.
 */
function buildCSV(headers, rows) {
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) val = val.join('; ');
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvHeaders = headers.map(escapeCSV).join(',');
  const csvRows = rows.map(row => row.map(escapeCSV).join(','));
  // prepend UTF-8 BOM so Excel reads special chars/currency correctly
  return '\uFEFF' + [csvHeaders, ...csvRows].join('\n');
}

/**
 * Helper function to convert transactions to CSV
 */
function convertToCSV(data, type = 'matched') {
  if (!data || data.length === 0) {
    return '\uFEFF' + 'No data available';
  }

  let headers = [];
  let rows = [];

  if (type === 'matched') {
    headers = [
      'Match Type', 'Confidence', 'Match Basis',
      'Bank Date', 'Bank Description', 'Bank Amount', 'Bank Reference',
      'Book Date', 'Book Description', 'Book Amount', 'Book Reference', 'Book Vendor'
    ];

    rows = data.map(match => [
      match.match_type || 'unknown',
      match.confidence || '',
      match.match_basis || 'Multiple Factors',
      match.bank_row?.date || match.bank?.date || match.bank?.transaction_date || '',
      match.bank_row?.description || match.bank?.description || '',
      match.bank_row?.amount || match.bank?.amount || '',
      match.bank_row?.referenceNumber || match.bank_row?.reference || match.bank?.reference || '',
      match.book_row?.date || match.book?.date || match.book?.transaction_date || '',
      match.book_row?.description || match.book?.description || '',
      match.book_row?.amount || match.book?.amount || '',
      match.book_row?.reference || match.book?.reference || '',
      match.book_row?.vendorName || match.book?.vendorName || ''
    ]);

    return buildCSV(headers, rows);
  } else if (type === 'bank') {
    headers = ['Date', 'Description', 'Amount', 'Currency', 'Reference', 'Transaction Type', 'Counterparty'];
    
    rows = data.map(txn => [
      txn.date || txn.transaction_date || '',
      txn.description || '',
      txn.amount || '',
      txn.currency || txn.currency_code || '',
      txn.referenceNumber || txn.reference || '',
      txn.transactionType || txn.type || '',
      txn.counterpartyName || txn.counterparty || ''
    ]);

    return buildCSV(headers, rows);
  } else if (type === 'book') {
    headers = ['Date', 'Description', 'Amount', 'Currency', 'Reference', 'Vendor', 'Category', 'Invoice Number'];
    
    rows = data.map(txn => [
      txn.date || txn.transaction_date || '',
      txn.description || '',
      txn.amount || '',
      txn.currency || txn.currency_code || '',
      txn.reference || txn.referenceNumber || '',
      txn.vendorName || txn.vendor || '',
      txn.category || '',
      txn.invoiceNumber || txn.invoice_no || ''
    ]);

    return buildCSV(headers, rows);
  } else if (type === 'vendor_anomalies') {
    // aim: one row per vendor outlier (or aggregated vendor outlier details)
    headers = [
      'Date', 'Vendor Name', 'CCD ID', 'Transaction Amount',
      'Vendor Average', 'Std Deviation', 'Z-Score', 'Deviation Percentage',
      'Outliers Count', 'Description', 'Risk Level', 'Anomaly Type'
    ];

    // Two accepted input shapes:
    // 1) array of anomaly objects (anomalyDetector.anomalies) -> map those with anomaly_type == 'VENDOR_OUTLIER'
    // 2) array/object vendor_outlier_details (vendor -> details) -> create summary rows
    if (Array.isArray(data)) {
      // If data is an array of vendor anomaly objects or generic anomalies
      rows = data.map(anom => {
        // normalize keys
        const date = anom.date || anom.Date || '';
        const vendor = anom.vendor || anom.Vendor_Name || anom.vendorName || anom.vendor_name || '';
        const amount = (typeof anom.amount !== 'undefined') ? anom.amount : (anom.Transaction_Amount || '');
        const stats = extractStatsFromAnomaly(anom);
        const outliersCount = anom.outliers_count || anom.Outliers_Count || (anom.outliers ? anom.outliers.length : '');
        const desc = anom.description || anom.Description || anom.desc || anom.reasons_text || anom.reasons || '';

        const riskLevel = anom.risk_level || anom.Risk_Level || anom.risk || '';
        const anomalyType = anom.anomaly_type || anom.Anomaly_Type || anom.type || '';

        return [
          date,
          vendor,
          anom.CCD_ID || anom.ccd_id || '',
          amount,
          stats.vendor_mean,
          stats.vendor_std,
          stats.z_score,
          stats.deviation_pct,
          outliersCount,
          desc,
          riskLevel,
          anomalyType
        ];
      });
    } else if (typeof data === 'object') {
      // object mapping vendor -> details
      rows = Object.entries(data).map(([vendor, details]) => {
        // details may include 'outliers' list
        const outliersList = details.outliers || [];
        if (Array.isArray(outliersList) && outliersList.length > 0) {
          // create one row per outlier inside vendor details for detail-level CSV
          return outliersList.map(o => ([
            o.date || o.Date || '',
            vendor,
            details.CCD_ID || '',
            o.amount || o.Transaction_Amount || '',
            details.vendor_mean || details.vendorMean || details.Vendor_Average || '',
            details.vendor_std || details.vendorStd || details.Std_Deviation || '',
            o.z_score || o.Z_Score || '',
            o.deviation_percent || o.Deviation_Percentage || '',
            details.outliers_found || o.outliers_count || details.outliers_found || details.outliers?.length || '',
            o.description || o.desc || '',
            'HIGH',
            'VENDOR_OUTLIER'
          ]));
        } else {
          return ([
            '',
            vendor,
            details.CCD_ID || '',
            '',
            details.vendor_mean || details.vendorMean || details.Vendor_Average || '',
            details.vendor_std || details.vendorStd || details.Std_Deviation || '',
            '',
            '',
            details.outliers_found || details.outliers_count || '',
            '',
            '',
            'VENDOR_SUMMARY'
          ]);
        }
      }).flat();
    }

    return buildCSV(headers, rows);
  } else if (type === 'missing_data') {
    headers = [
      'Date', 'Vendor Name', 'CCD ID', 'Amount',
      'Missing Fields', 'Description', 'Issue Type', 'Risk Level'
    ];

    // Accept array of anomaly objects or missing_data objects
    rows = (Array.isArray(data) ? data : []).map(miss => {
      const date = miss.date || miss.Date || '';
      const vendor = miss.vendor || miss.Vendor_Name || miss.vendorName || 'MISSING';
      const ccd = miss.CCD_ID || miss.ccd_id || '';
      const amount = (typeof miss.amount !== 'undefined') ? miss.amount : (miss.Amount || '');
      const missingFields = miss.missing_fields || miss.Missing_Fields || miss.MissingFields || (miss.Issue_Type ? miss.Issue_Type : '');
      const desc = miss.description || miss.Description || miss.desc || miss.reasons_text || miss.reasons || '';
      const issueType = miss.issue_type || miss.Issue_Type || miss.issue || 'MISSING_DATA';
      const riskLevel = miss.risk_level || miss.Risk_Level || miss.score ? miss.score : 'MEDIUM';

      return [date, vendor, ccd, amount, missingFields, desc, issueType, riskLevel];
    });

    return buildCSV(headers, rows);
  } else if (type === 'anomalies') {
    // enrich anomalies CSV with parsed columns for vendor stats
    headers = [
      'Transaction ID', 'Date', 'Amount', 'Description', 'Vendor',
      'Anomaly Type', 'Risk Level', 'Risk Score',
      'Vendor Mean', 'Vendor Std', 'Z-Score', 'Deviation %', 'Raw Reasons'
    ];

    rows = (Array.isArray(data) ? data : []).map(anom => {
      const txId = anom.transaction?.id || anom.transaction_id || anom.id || anom.txn_id || '';
      const txDate = anom.transaction?.date || anom.transaction_date || anom.date || anom.Date || '';
      const txAmount = (typeof anom.transaction?.amount !== 'undefined') ? anom.transaction.amount : (typeof anom.amount !== 'undefined' ? anom.amount : '');
      const txDesc = anom.transaction?.description || anom.transaction?.desc || anom.description || anom.Description || '';
      const vendor = anom.vendor || anom.Vendor_Name || anom.vendorName || anom.vendor_name || '';
      const anomalyType = anom.anomaly_type || anom.Anomaly_Type || anom.type || '';
      const riskLevel = anom.risk_level || anom.Risk_Level || anom.severity || '';
      const riskScore = (typeof anom.risk_score !== 'undefined') ? anom.risk_score : (typeof anom.score !== 'undefined' ? anom.score : '');

      const stats = extractStatsFromAnomaly(anom);
      const rawReasons = Array.isArray(anom.reasons) ? anom.reasons.join(' | ') : (anom.reasons_text || anom.reason || '');

      return [
        txId,
        txDate,
        txAmount,
        txDesc,
        vendor,
        anomalyType,
        riskLevel,
        riskScore,
        stats.vendor_mean,
        stats.vendor_std,
        stats.z_score,
        stats.deviation_pct,
        rawReasons
      ];
    });

    return buildCSV(headers, rows);
  }

  // default fallback
  const fallbackHeaders = Object.keys((data[0] && typeof data[0] === 'object') ? data[0] : {});
  const fallbackRows = (Array.isArray(data) ? data : []).map(d => fallbackHeaders.map(h => d[h] || ''));
  return buildCSV(fallbackHeaders, fallbackRows);
}

const ReconciliationController = {
  reconcileAndAnalyze: async (req, res) => {
    const startTime = Date.now();
    console.log("\n🎯 ============= RECONCILIATION STARTED =============");
    console.log("📅 Timestamp:", new Date().toISOString());
    
    try {
      const accountId = parseInt(req.params.accountId, 10);
      console.log("🔑 Account ID:", accountId, typeof accountId);
      
      if (!accountId || isNaN(accountId)) {
        console.error("❌ Invalid accountId:", req.params.accountId);
        return res.status(400).json({ 
          success: false, 
          error: "Valid accountId required",
          received: req.params.accountId
        });
      }

      console.log("📥 Fetching transactions from database...");
      
      const bankTxnsRaw = await BankTransaction.findAll({ 
        where: { accountId },
        raw: true
      });
      
      const bookTxnsRaw = await BookTransaction.findAll({ 
        where: { accountId },
        raw: true
      });

      console.log(`📊 Raw Transactions: bank=${bankTxnsRaw.length}, book=${bookTxnsRaw.length}`);

      if (!bankTxnsRaw.length && !bookTxnsRaw.length) {
        console.warn("⚠️ No transactions found for accountId:", accountId);
        return res.status(404).json({
          success: false,
          error: "No transactions found for this account",
          accountId: accountId
        });
      }

      if (!bankTxnsRaw.length) {
        console.warn("⚠️ No bank transactions found");
        return res.status(400).json({
          success: false,
          error: "No bank transactions found. Please upload bank statement first.",
          bookTransactionsFound: bookTxnsRaw.length
        });
      }

      if (!bookTxnsRaw.length) {
        console.warn("⚠️ No ledger transactions found");
        return res.status(400).json({
          success: false,
          error: "No ledger transactions found. Please upload ledger file first.",
          bankTransactionsFound: bankTxnsRaw.length
        });
      }

      const bankTxns = bankTxnsRaw.map((t) => ({
        ...t,
        date: t.date instanceof Date ? t.date.toISOString() : t.date,
        amount: parseFloat(t.amount) || 0
      }));

      const bookTxns = bookTxnsRaw.map((t) => ({
        ...t,
        date: t.date instanceof Date ? t.date.toISOString() : t.date,
        amount: parseFloat(t.amount) || 0
      }));

      console.log("✅ Transactions loaded successfully");

      const aiEnabled = String(process.env.AI_ENABLED).toLowerCase() === "true";
      console.log("🤖 AI Mode:", aiEnabled ? "ENABLED" : "DISABLED");

      if (aiEnabled) {
        console.log("⚡ Running AI-based reconciliation...");

        const matcherScript = path.resolve(projectRoot, "..", "ai", "advancedMatcher.py");
        const analyticsScript = path.resolve(projectRoot, "..", "ai", "analyticsEngine.py");
        const anomalyScript = path.resolve(projectRoot, "..", "ai", "anomalyDetector.py");

        console.log("📂 Matcher Script:", matcherScript);
        console.log("📂 Analytics Script:", analyticsScript);
        console.log("📂 Anomaly Script:", anomalyScript);

        if (!fs.existsSync(matcherScript)) {
          console.error("❌ Matcher script not found at:", matcherScript);
          return res.status(500).json({
            success: false,
            error: "AI matcher script not found",
            path: matcherScript
          });
        }

        let matchResults;
        try {
          console.log("🔄 Calling advancedMatcher.py...");
          matchResults = await runPython(matcherScript, {
            bank_transactions: bankTxns,
            book_transactions: bookTxns,
          });
          console.log("✅ Matcher completed:", Object.keys(matchResults));
        } catch (err) {
          console.error("❌ Matcher error:", err.message);
          return res.status(500).json({
            success: false,
            error: "AI Matcher failed",
            details: err.message
          });
        }

        // 🆕 IMPROVED: Anomaly Detection with Dual Output
        let anomalyResults = null;
        if (fs.existsSync(anomalyScript)) {
          try {
            console.log("🔄 Calling anomalyDetector.py...");
            
            // Combine all transactions for anomaly detection
            const allTransactions = [...bankTxns, ...bookTxns];
            
            // Send shape that detector expects
            anomalyResults = await runPython(anomalyScript, {
              bank_transactions: bankTxns,
              book_transactions: bookTxns
            });
            
            console.log("✅ Anomaly detection completed");
            console.log(`   📊 Vendor Outliers: ${anomalyResults.summary?.vendor_outliers || 0}`);
            console.log(`   📋 Missing Data: ${anomalyResults.summary?.missing_data_records || 0}`);
            console.log(`   🏢 Vendors Analyzed: ${anomalyResults.summary?.vendors_analyzed || 0}`);
            
          } catch (err) {
            console.error("⚠️ Anomaly detection error (non-critical):", err.message);
            anomalyResults = null;
          }
        } else {
          console.warn("⚠️ Anomaly script not found, skipping");
        }

        // 🆕 CACHE ALL RESULTS INCLUDING ANOMALIES
        reconciliationCache.set(getCacheKey(accountId), {
          matchResults,
          anomalyResults,
          timestamp: Date.now(),
          bankTxns,
          bookTxns
        });
        console.log("💾 Results cached for account:", accountId);

        let analyticsResults = null;
        if (fs.existsSync(analyticsScript)) {
          try {
            console.log("🔄 Calling analyticsEngine.py...");
            analyticsResults = await runPython(analyticsScript, {
              account_id: accountId,
              reconciliation_data: matchResults.summary || {},
              transactions: [...bankTxns, ...bookTxns],
              matches: matchResults.matches || [],
            });
            console.log("✅ Analytics completed");
          } catch (err) {
            console.error("⚠️ Analytics error (non-critical):", err.message);
            analyticsResults = null;
          }
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Reconciliation completed in ${duration}ms`); 
        console.log("============= RECONCILIATION ENDED =============\n");

        return res.json({
          success: true,
          ...matchResults,
          anomalies: anomalyResults?.vendor_anomalies || anomalyResults?.anomalies || [],
          missing_data: anomalyResults?.missing_data || [],
          anomaly_summary: anomalyResults?.summary || null,
          vendor_statistics: anomalyResults?.vendor_statistics || null,
          analytics: analyticsResults?.analytics || null,
          processingTime: duration,
          timestamp: new Date().toISOString()
        });
      }

      // Fallback JS reconciliation
      console.log("⚡ Using fallback JS reconciliation");
      const matches = [];
      const unmatchedBank = [];
      const usedBookIds = new Set();

      for (const b of bankTxns) {
        let found = false;
        for (const l of bookTxns) {
          if (usedBookIds.has(l.id)) continue;

          const bAmt = parseFloat(b.amount) || 0;
          const lAmt = parseFloat(l.amount) || 0;
          const bDate = new Date(b.date);
          const lDate = new Date(l.date);

          if (
            Math.abs(bAmt - lAmt) < 0.01 &&
            Math.abs(bDate - lDate) <= 3 * 24 * 60 * 60 * 1000
          ) {
            matches.push({ 
              bank: b, 
              book: l,
              confidence: 0.95,
              match_type: "exact"
            });
            usedBookIds.add(l.id);
            found = true;
            break;
          }
        }
        if (!found) unmatchedBank.push(b);
      }

      const unmatchedBook = bookTxns.filter(t => !usedBookIds.has(t.id));

      const duration = Date.now() - startTime;
      console.log(`✅ Fallback reconciliation completed in ${duration}ms`);
      console.log("============= RECONCILIATION ENDED =============\n");

      return res.json({
        success: true,
        summary: {
          total_bank_transactions: bankTxns.length,
          total_book_transactions: bookTxns.length,
          total_matches: matches.length,
          unmatched_bank: unmatchedBank.length,
          unmatched_book: unmatchedBook.length,
          match_rate: ((matches.length / Math.max(bankTxns.length, bookTxns.length)) * 100).toFixed(2) + '%'
        },
        matches,
        unmatched_bank: unmatchedBank,
        unmatched_book: unmatchedBook,
        anomalies: [],
        missing_data: [],
        anomaly_summary: null,
        processingTime: duration,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      const duration = Date.now() - startTime;
      console.error("\n❌ ============= RECONCILIATION FAILED =============");
      console.error("Error:", err.message);
      console.error("Stack:", err.stack);
      console.error(`Duration: ${duration}ms`);
      console.error("=================================================\n");
      
      return res.status(500).json({
        success: false,
        error: "Reconciliation failed",
        message: err.message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        timestamp: new Date().toISOString()
      });
    }
  },

  exportMatched: async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId, 10);
      console.log('📥 Exporting Matched Transactions for Account:', accountId);
      
      const cacheKey = getCacheKey(accountId);
      const cached = reconciliationCache.get(cacheKey);
      
      if (cached && cached.matchResults) {
        console.log('✅ Using cached reconciliation results');
        const matches = cached.matchResults.matches || [];
        console.log(`✅ Found ${matches.length} matched transactions from cache`);
        
        const csv = convertToCSV(matches, 'matched');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=matched_transactions_${accountId}.csv`);
        return res.send(csv);
      }
      
      console.log('⚠️ No cache found, using fallback logic');
      const bankTxns = await BankTransaction.findAll({ where: { accountId }, raw: true });
      const bookTxns = await BookTransaction.findAll({ where: { accountId }, raw: true });
      
      const matches = [];
      const usedBookIds = new Set();
      
      for (const b of bankTxns) {
        for (const l of bookTxns) {
          if (usedBookIds.has(l.id)) continue;
          const bAmt = parseFloat(b.amount) || 0;
          const lAmt = parseFloat(l.amount) || 0;
          const bDate = new Date(b.date);
          const lDate = new Date(l.date);
          
          if (Math.abs(bAmt - lAmt) < 0.01 && Math.abs(bDate - lDate) <= 3 * 24 * 60 * 60 * 1000) {
            matches.push({ bank: b, book: l, confidence: 0.95, match_type: "exact" });
            usedBookIds.add(l.id);
            break;
          }
        }
      }
      
      const csv = convertToCSV(matches, 'matched');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=matched_transactions_${accountId}.csv`);
      res.send(csv);
    } catch (err) {
      console.error('❌ Export Matched Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  exportUnmatchedBank: async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId, 10);
      console.log('📥 Exporting Unmatched Bank Transactions for Account:', accountId);
      
      const cacheKey = getCacheKey(accountId);
      const cached = reconciliationCache.get(cacheKey);
      
      if (cached && cached.matchResults) {
        console.log('✅ Using cached reconciliation results (DEDUPLICATED)');
        const unmatchedBank = cached.matchResults.unmatched_bank || [];
        console.log(`✅ Found ${unmatchedBank.length} unmatched bank transactions (deduplicated)`);
        
        const csv = convertToCSV(unmatchedBank, 'bank');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=unmatched_bank_${accountId}.csv`);
        return res.send(csv);
      }
      
      console.log('⚠️ No cache found, using fallback logic (may have duplicates)');
      const bankTxns = await BankTransaction.findAll({ where: { accountId }, raw: true });
      const bookTxns = await BookTransaction.findAll({ where: { accountId }, raw: true });
      
      const usedBankIds = new Set();
      
      for (const b of bankTxns) {
        for (const l of bookTxns) {
          const bAmt = parseFloat(b.amount) || 0;
          const lAmt = parseFloat(l.amount) || 0;
          const bDate = new Date(b.date);
          const lDate = new Date(l.date);
          
          if (Math.abs(bAmt - lAmt) < 0.01 && Math.abs(bDate - lDate) <= 3 * 24 * 60 * 60 * 1000) {
            usedBankIds.add(b.id);
            break;
          }
        }
      }
      
      const unmatchedBank = bankTxns.filter(t => !usedBankIds.has(t.id));
      console.log(`✅ Found ${unmatchedBank.length} unmatched bank transactions (fallback)`);
      
      const csv = convertToCSV(unmatchedBank, 'bank');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=unmatched_bank_${accountId}.csv`);
      res.send(csv);
    } catch (err) {
      console.error('❌ Export Unmatched Bank Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  exportUnmatchedBook: async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId, 10);
      console.log('📥 Exporting Unmatched Book Transactions for Account:', accountId);
      
      const cacheKey = getCacheKey(accountId);
      const cached = reconciliationCache.get(cacheKey);
      
      if (cached && cached.matchResults) {
        console.log('✅ Using cached reconciliation results');
        const unmatchedBook = cached.matchResults.unmatched_book || [];
        console.log(`✅ Found ${unmatchedBook.length} unmatched book transactions`);
        
        const csv = convertToCSV(unmatchedBook, 'book');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=unmatched_book_${accountId}.csv`);
        return res.send(csv);
      }
      
      console.log('⚠️ No cache found, using fallback logic');
      const bankTxns = await BankTransaction.findAll({ where: { accountId }, raw: true });
      const bookTxns = await BookTransaction.findAll({ where: { accountId }, raw: true });
      
      const usedBookIds = new Set();
      
      for (const b of bankTxns) {
        for (const l of bookTxns) {
          if (usedBookIds.has(l.id)) continue;
          const bAmt = parseFloat(b.amount) || 0;
          const lAmt = parseFloat(l.amount) || 0;
          const bDate = new Date(b.date);
          const lDate = new Date(l.date);
          
          if (Math.abs(bAmt - lAmt) < 0.01 && Math.abs(bDate - lDate) <= 3 * 24 * 60 * 60 * 1000) {
            usedBookIds.add(l.id);
            break;
          }
        }
      }
      
      const unmatchedBook = bookTxns.filter(t => !usedBookIds.has(t.id));
      console.log(`✅ Found ${unmatchedBook.length} unmatched book transactions`);
      
      const csv = convertToCSV(unmatchedBook, 'book');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=unmatched_book_${accountId}.csv`);
      res.send(csv);
    } catch (err) {
      console.error('❌ Export Unmatched Book Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

    exportAnomalies: async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId, 10);
      console.log('📥 Exporting Anomalies for Account:', accountId);

      const cacheKey = getCacheKey(accountId);
      const cached = reconciliationCache.get(cacheKey);

      // Robust selection: try multiple possible shapes returned by AI or JS fallback
      let anomaliesFromCache = [];
      if (cached) {
        // prefer anomalyResults.vendor_anomalies (older code expected this)
        if (cached.anomalyResults && Array.isArray(cached.anomalyResults.vendor_anomalies) && cached.anomalyResults.vendor_anomalies.length) {
          anomaliesFromCache = cached.anomalyResults.vendor_anomalies;
          console.log(`   ✅ Using cached anomalyResults.vendor_anomalies (${anomaliesFromCache.length})`);
        }
        // next prefer anomalyResults.anomalies (this is what the current Python detector returns)
        else if (cached.anomalyResults && Array.isArray(cached.anomalyResults.anomalies) && cached.anomalyResults.anomalies.length) {
          anomaliesFromCache = cached.anomalyResults.anomalies;
          console.log(`   ✅ Using cached anomalyResults.anomalies (${anomaliesFromCache.length})`);
        }
        // fallback: some flows might have anomalies inside matchResults
        else if (cached.matchResults && Array.isArray(cached.matchResults.anomalies) && cached.matchResults.anomalies.length) {
          anomaliesFromCache = cached.matchResults.anomalies;
          console.log(`   ✅ Using cached matchResults.anomalies (${anomaliesFromCache.length})`);
        }
      }

      if (anomaliesFromCache && anomaliesFromCache.length) {
        console.log(`✅ Found ${anomaliesFromCache.length} anomalies from cache`);
        const csvFromCache = convertToCSV(anomaliesFromCache, 'anomalies');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=anomalies_${accountId}.csv`);
        return res.send(csvFromCache);
      }

      // No cached anomalies — run anomaly detector as before
      const bankTxns = await BankTransaction.findAll({ where: { accountId }, raw: true });
      const bookTxns = await BookTransaction.findAll({ where: { accountId }, raw: true });

      const anomalyScript = path.resolve(projectRoot, "..", "ai", "anomalyDetector.py");

      if (!fs.existsSync(anomalyScript)) {
        return res.status(404).json({
          success: false,
          error: 'Anomaly detection script not found'
        });
      }

      const anomalyResults = await runPython(anomalyScript, {
        bank_transactions: bankTxns,
        book_transactions: bookTxns
      });


      // Accept different output shapes from Python
      const anomalies = anomalyResults.vendor_anomalies || anomalyResults.anomalies || [];
      console.log(`✅ Found ${anomalies.length} anomalies from script`);

      const csv = convertToCSV(anomalies, 'anomalies');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=anomalies_${accountId}.csv`);
      res.send(csv);
    } catch (err) {
      console.error('❌ Export Anomalies Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  },


  // 🆕 NEW: Export Vendor Outliers
  exportVendorOutliers: async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId, 10);
      console.log('📊 Exporting Vendor Outliers for Account:', accountId);

      const cacheKey = getCacheKey(accountId);
      const cached = reconciliationCache.get(cacheKey);
      
      if (cached && cached.anomalyResults && cached.anomalyResults.vendor_anomalies) {
        console.log('✅ Using cached vendor outliers');
        const vendorAnomalies = cached.anomalyResults.vendor_anomalies;
        console.log(`✅ Found ${vendorAnomalies.length} vendor outliers`);
        
        const csv = convertToCSV(vendorAnomalies, 'vendor_anomalies');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=vendor_outliers_${accountId}.csv`);
        return res.send(csv);
      }

      // Fallback: Run anomaly detection if not cached
      console.log('⚠️ No cache found, running anomaly detection...');
      const bankTxns = await BankTransaction.findAll({ where: { accountId }, raw: true });
      const bookTxns = await BookTransaction.findAll({ where: { accountId }, raw: true });
      
      const anomalyScript = path.resolve(projectRoot, "..", "ai", "anomalyDetector.py");
      
      if (!fs.existsSync(anomalyScript)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Anomaly detection script not found' 
        });
      }
      
      const anomalyResults = await runPython(anomalyScript, {
        bank_transactions: bankTxns,
        book_transactions: bookTxns
      });

      
      const vendorAnomalies = anomalyResults.vendor_anomalies || anomalyResults.anomalies || [];
      console.log(`✅ Found ${vendorAnomalies.length} vendor outliers`);
      
      const csv = convertToCSV(vendorAnomalies, 'vendor_anomalies');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=vendor_outliers_${accountId}.csv`);
      res.send(csv);
    } catch (err) {
      console.error('❌ Export Vendor Outliers Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // 🆕 NEW: Export Missing Data
  exportMissingData: async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId, 10);
      console.log('📋 Exporting Missing Data for Account:', accountId);

      const cacheKey = getCacheKey(accountId);
      const cached = reconciliationCache.get(cacheKey);
      
      if (cached && cached.anomalyResults && cached.anomalyResults.missing_data) {
        console.log('✅ Using cached missing data');
        const missingData = cached.anomalyResults.missing_data;
        console.log(`✅ Found ${missingData.length} records with missing data`);
        
        const csv = convertToCSV(missingData, 'missing_data');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=missing_data_${accountId}.csv`);
        return res.send(csv);
      }

      // Fallback: Run anomaly detection if not cached
      console.log('⚠️ No cache found, running anomaly detection...');
      const bankTxns = await BankTransaction.findAll({ where: { accountId }, raw: true });
      const bookTxns = await BookTransaction.findAll({ where: { accountId }, raw: true });
      
      const anomalyScript = path.resolve(projectRoot, "..", "ai", "anomalyDetector.py");
      
      if (!fs.existsSync(anomalyScript)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Anomaly detection script not found' 
        });
      }
      
      anomalyResults = await runPython(anomalyScript, {
        bank_transactions: bankTxns,
        book_transactions: bookTxns
      });

      
      const missingData = anomalyResults.missing_data || [];
      console.log(`✅ Found ${missingData.length} records with missing data`);
      
      const csv = convertToCSV(missingData, 'missing_data');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=missing_data_${accountId}.csv`);
      res.send(csv);
    } catch (err) {
      console.error('❌ Export Missing Data Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  startReconciliation: async (req, res) =>
    res.json({ success: true, message: "Start reconciliation not implemented" }),
  getReconciliationStatus: async (req, res) => res.json({ status: "in-progress" }),
  getReconciliationResults: async (req, res) => res.json({ results: [] }),
  createManualMatch: async (req, res) => res.json({ success: true }),
  unmatchTransactions: async (req, res) => res.json({ success: true }),
  listSessions: async (req, res) => res.json({ sessions: [] }),
  getExceptions: async (req, res) => res.json({ exceptions: [] }),
  approveSession: async (req, res) =>
    res.json({ success: true, message: "Session approved" }),
  exportResults: async (req, res) =>
    res.json({ success: true, file: "export.csv" }),
};


module.exports = { 
  ReconciliationController,
  reconcileAndAnalyze: ReconciliationController.reconcileAndAnalyze
};
