import React, { useState } from "react";
import { UploadCloud, FileSpreadsheet, FileText, Download, AlertTriangle, TrendingUp, FileWarning } from "lucide-react";

const UploadPage = () => {
  const [accountId, setAccountId] = useState(1);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [bankFile, setBankFile] = useState(null);
  const [bookFile, setBookFile] = useState(null);
  const [status, setStatus] = useState("");
  const [reconcileResult, setReconcileResult] = useState(null);

  // <-- minimal change: read token from localStorage (if present)
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const handleUpload = async (file, type) => {
    const endpoint = type === "bank" ? "/api/files/bank-statement" : "/api/files/ledger";
    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", accountId);
    formData.append("periodFrom", periodFrom);
    formData.append("periodTo", periodTo);

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      credentials: "include",
      // sending Authorization only if token exists; do NOT set Content-Type for FormData
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return response.json();
  };

  const handleSubmit = async () => {
    setStatus("📤 Uploading files...");
    setReconcileResult(null);
    
    try {
      let results = [];
      if (bankFile) results.push(await handleUpload(bankFile, "bank"));
      if (bookFile) results.push(await handleUpload(bookFile, "book"));

      setStatus(prev => prev + "\n\n" + results.map(r => 
        r.file ? `✅ Uploaded ${r.file.fileType}: ${r.file.originalFilename}` 
               : `❌ Upload failed: ${r.error}`
      ).join("\n"));

      const allUploadsSuccessful = results.every(r => r.success);
      if (!allUploadsSuccessful) {
        setStatus(prev => prev + "\n\n⚠️ Some uploads failed. Skipping reconciliation.");
        return;
      }

      setStatus(prev => prev + "\n\n⚙️ Starting reconciliation...");
      
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const reconcileResponse = await fetch(`/api/reconciliation/${accountId}`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ periodFrom, periodTo }),
      });

      const reconcileData = await reconcileResponse.json();

      // Status update after reconciliation
      if (reconcileResponse.ok && reconcileData.success) {
        setStatus((prev) =>
          prev +
            `\n\n🔄 Reconciliation Completed!\n` +
            `📊 Bank Transactions: ${reconcileData.summary?.total_bank_transactions || 0}\n` +
            `📚 Book Transactions: ${reconcileData.summary?.total_book_transactions || 0}\n` +
            `✅ Matched: ${reconcileData.matches?.length || reconcileData.summary?.total_matches || 0}\n` +
            `❌ Unmatched Bank: ${reconcileData.unmatched_bank?.length || reconcileData.summary?.unmatched_bank || 0}\n` +
            `⚠️ Unmatched Book: ${reconcileData.unmatched_book?.length || reconcileData.summary?.unmatched_book || 0}\n` +
            `📈 Match Rate: ${reconcileData.summary?.match_rate || "N/A"}\n` +
            `\n🚨 ANOMALY DETECTION:\n` +
            `   📊 Vendor Outliers: ${reconcileData.anomaly_summary?.vendor_outliers || 0}\n` +
            `   📋 Missing Data: ${reconcileData.anomaly_summary?.missing_data_records || 0}\n` +
            `   🏢 Vendors Analyzed: ${reconcileData.anomaly_summary?.vendors_analyzed || 0}`
        );

        setReconcileResult(reconcileData);
      }
      
      else {
        setStatus(prev => prev + `\n\n❌ Reconciliation failed: ${reconcileData.error || "Unknown error"}`);
      }
    } catch (err) {
      setStatus(prev => prev + `\n\n❌ Error: ${err.message}`);
    }
  };

  const handleDownloadCSV = async (type) => {
    try {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      // <-- minimal change: use export-first routes to match backend
      const endpoints = {
        'matched': `/api/reconciliation/export/matched/${accountId}`,
        'unmatched-bank': `/api/reconciliation/export/unmatched-bank/${accountId}`,
        'unmatched-book': `/api/reconciliation/export/unmatched-book/${accountId}`,
        'anomalies': `/api/reconciliation/export/anomalies/${accountId}`,
        'vendor-outliers': `/api/reconciliation/export/vendor-outliers/${accountId}`,
        'missing-data': `/api/reconciliation/export/missing-data/${accountId}`,
      };

      const filenames = {
        'matched': `matched_transactions_${accountId}.csv`,
        'unmatched-bank': `unmatched_bank_${accountId}.csv`,
        'unmatched-book': `unmatched_book_${accountId}.csv`,
        'anomalies': `anomalies_${accountId}.csv`,
        'vendor-outliers': `vendor_outliers_${accountId}.csv`,
        'missing-data': `missing_data_${accountId}.csv`,
      };

      const response = await fetch(endpoints[type], {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        // better debug message without changing behavior
        const txt = await response.text().catch(() => "");
        throw new Error(`Export failed (status ${response.status}) ${txt ? `: ${txt}` : ""}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenames[type];
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log(`✅ Downloaded: ${filenames[type]}`);
    } catch (err) {
      alert('Failed to download: ' + err.message);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Upload Statements</h1>

      {/* Account & Period */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Account & Period</h2>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Select Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(Number(e.target.value))} 
            className="w-full border rounded-lg p-3"
          >
            <option value="1">HDFC Corp Account</option>
            <option value="2">ICICI Business Account</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Period From</label>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="w-full border rounded-lg p-3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Period To</label>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="w-full border rounded-lg p-3"
            />
          </div>
        </div>
      </div>

      {/* Upload Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <FileSpreadsheet className="h-6 w-6 text-green-600" />
            <h3 className="text-lg font-semibold">Bank Statement</h3>
          </div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            onChange={(e) => setBankFile(e.target.files[0])}
            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg 
                       file:border-0 file:bg-green-100 file:text-green-700 
                       hover:file:bg-green-200 cursor-pointer"
          />
          {bankFile && <p className="mt-2 text-sm text-gray-600">Selected: {bankFile.name}</p>}
        </div>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="h-6 w-6 text-blue-600" />
            <h3 className="text-lg font-semibold">Book Statement</h3>
          </div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            onChange={(e) => setBookFile(e.target.files[0])}
            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg 
                       file:border-0 file:bg-blue-100 file:text-blue-700 
                       hover:file:bg-blue-200 cursor-pointer"
          />
          {bookFile && <p className="mt-2 text-sm text-gray-600">Selected: {bookFile.name}</p>}
        </div>
      </div>

      {/* Upload Button */}
      <button
        onClick={handleSubmit}
        disabled={!bankFile && !bookFile}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r 
                   from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 
                   text-white font-semibold py-4 rounded-xl shadow-lg transition
                   disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed"
      >
        <UploadCloud className="h-5 w-5" />
        Upload & Reconcile
      </button>

      {/* Status */}
      {status && (
        <pre className="mt-6 text-sm whitespace-pre-line bg-gray-900 text-green-400 
                        p-4 rounded-lg border border-gray-700 font-mono">
          {status}
        </pre>
      )}

      {/* Results */}
      {reconcileResult && (
        <div className="mt-8 space-y-6">
          <h2 className="text-2xl font-bold">Reconciliation Summary</h2>
          
          {/* Main Stats */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-90 mb-1">Matches</p>
              <p className="text-4xl font-bold">{reconcileResult.summary?.total_matches || 0}</p>
            </div>
            <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-90 mb-1">Unmatched Bank</p>
              <p className="text-4xl font-bold">{reconcileResult.summary?.unmatched_bank || 0}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-90 mb-1">Unmatched Book</p>
              <p className="text-4xl font-bold">{reconcileResult.summary?.unmatched_book || 0}</p>
            </div>
          </div>

          {/* Anomaly Stats */}
          {reconcileResult.anomaly_summary && (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-xl border-2 border-yellow-300">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
                <h3 className="text-xl font-bold text-yellow-900">Anomaly Detection Results</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border-l-4 border-red-500">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-5 w-5 text-red-600" />
                    <p className="text-sm text-gray-600 font-semibold">Vendor Outliers</p>
                  </div>
                  <p className="text-3xl font-bold text-red-600">
                    {reconcileResult.anomaly_summary.vendor_outliers || 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Statistical anomalies by vendor</p>
                </div>
                <div className="bg-white p-4 rounded-lg border-l-4 border-orange-500">
                  <div className="flex items-center gap-2 mb-2">
                    <FileWarning className="h-5 w-5 text-orange-600" />
                    <p className="text-sm text-gray-600 font-semibold">Missing Data</p>
                  </div>
                  <p className="text-3xl font-bold text-orange-600">
                    {reconcileResult.anomaly_summary.missing_data_records || 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Missing vendor/description/reference</p>
                </div>
              </div>
            </div>
          )}

          {/* Download Section */}
          <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-blue-200">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-600" />
              Download Reports (CSV)
            </h3>
            
            {/* Standard Downloads */}
            <div className="grid md:grid-cols-4 gap-3 mb-4">
              <button
                onClick={() => handleDownloadCSV('matched')}
                className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 
                           text-white font-semibold py-3 px-4 rounded-lg shadow transition"
              >
                <Download className="h-4 w-4" />
                Matched ({reconcileResult.summary?.total_matches || 0})
              </button>
              
              <button
                onClick={() => handleDownloadCSV('unmatched-bank')}
                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 
                           text-white font-semibold py-3 px-4 rounded-lg shadow transition"
              >
                <Download className="h-4 w-4" />
                Unmatched Bank ({reconcileResult.summary?.unmatched_bank || 0})
              </button>
              
              <button
                onClick={() => handleDownloadCSV('unmatched-book')}
                className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 
                           text-white font-semibold py-3 px-4 rounded-lg shadow transition"
              >
                <Download className="h-4 w-4" />
                Unmatched Book ({reconcileResult.summary?.unmatched_book || 0})
              </button>

              <button
                onClick={() => handleDownloadCSV('anomalies')}
                className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 
                           text-white font-semibold py-3 px-4 rounded-lg shadow transition"
              >
                <Download className="h-4 w-4" />
                All Anomalies
              </button>
            </div>

            {/* 🆕 NEW: Anomaly-Specific Downloads */}
            {reconcileResult.anomaly_summary && (
              <div className="border-t-2 border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">🔍 Detailed Anomaly Reports:</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <button
                    onClick={() => handleDownloadCSV('vendor-outliers')}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r 
                               from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 
                               text-white font-semibold py-3 px-4 rounded-lg shadow-lg transition"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Vendor Outliers ({reconcileResult.anomaly_summary.vendor_outliers || 0})
                  </button>
                  
                  <button
                    onClick={() => handleDownloadCSV('missing-data')}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r 
                               from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 
                               text-white font-semibold py-3 px-4 rounded-lg shadow-lg transition"
                  >
                    <FileWarning className="h-4 w-4" />
                    Missing Data ({reconcileResult.anomaly_summary.missing_data_records || 0})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Vendor Statistics */}
          {reconcileResult.vendor_statistics && Object.keys(reconcileResult.vendor_statistics).length > 0 && (
            <div className="bg-blue-50 p-6 rounded-xl border-2 border-blue-200">
              <h3 className="text-lg font-bold mb-4">📊 Vendor Statistics</h3>
              <div className="grid md:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                {Object.entries(reconcileResult.vendor_statistics).slice(0, 9).map(([vendor, stats]) => (
                  <div key={vendor} className="bg-white p-4 rounded-lg border">
                    <p className="font-semibold text-sm text-gray-800 mb-2 truncate">{vendor}</p>
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>Transactions: {stats.count}</p>
                      <p>Average: ₹{stats.mean}</p>
                      <p>Std Dev: ±₹{stats.std}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UploadPage;
