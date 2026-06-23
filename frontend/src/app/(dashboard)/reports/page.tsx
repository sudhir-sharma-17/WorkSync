"use client";

import React, { useState, useEffect } from "react";
import { 
  FileSpreadsheet, 
  Calendar, 
  Download, 
  Clock, 
  Link2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Eye,
  FileText,
  Search,
  Grid,
  List,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Batch {
  id: string;
  status: string;
  form_url: string;
  created_at: string;
}

interface RecordDetail {
  id: string;
  attendance_date: string;
  worker_name: string;
  worker_type: string;
  project_name: string;
  boq_category: string;
  description: string;
  duration: string;
  status: "valid" | "invalid";
  error_message?: string;
}

export default function ReportsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [batchLogs, setBatchLogs] = useState<Record<string, RecordDetail[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/records/batches");
      const fetchedBatches = data.batches || [];
      setBatches(fetchedBatches);
      
      // Fetch details for each batch to get record counts and log details
      fetchedBatches.forEach((batch: Batch) => {
        fetchBatchDetails(batch.id);
      });
    } catch (e) {
      console.error("Error fetching batches:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchDetails = async (batchId: string) => {
    setLoadingLogs(prev => ({ ...prev, [batchId]: true }));
    try {
      const data = await apiFetch(`/api/records/preview/${batchId}`);
      setBatchLogs(prev => ({ ...prev, [batchId]: data.records || [] }));
    } catch (e) {
      console.error(`Error fetching batch details for ${batchId}:`, e);
    } finally {
      setLoadingLogs(prev => ({ ...prev, [batchId]: false }));
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleExportCSV = (batchId: string, logs: RecordDetail[]) => {
    if (!logs || logs.length === 0) return;
    const headers = "Worker Name,Attendance Date,Project Name,BOQ Category,Duration,Status,Error Message\n";
    const rows = logs.map(log => 
      `"${log.worker_name}","${log.attendance_date}","${log.project_name}","${log.boq_category}","${log.duration}","${log.status === "valid" ? "Success" : "Failed"}","${log.error_message || ""}"`
    ).join("\n");
    
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", `attendance_report_${batchId.substring(0, 8)}.csv`);
    a.click();
  };

  const formatTimestamp = (isoString: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "Failed":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      case "Running":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse";
      default:
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
    }
  };

  const filteredBatches = batches.filter(batch => 
    batch.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    batch.form_url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUploadedFiles = batches.length;
  const totalRecordsProcessed = Object.values(batchLogs).reduce((acc, curr) => acc + curr.length, 0);
  const totalSuccessfulRecords = Object.values(batchLogs).reduce((acc, curr) => 
    acc + curr.filter(log => log.status === "valid").length, 0
  );

  const openPreview = (batch: Batch) => {
    setSelectedBatch(batch);
    setShowPreviewModal(true);
    if (!batchLogs[batch.id]) {
      fetchBatchDetails(batch.id);
    }
  };

  return (
    <div className="space-y-8 relative z-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">Session Reports & Archives</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Access previous session sheets, download auto-generated CSV reports, and view execution audits.
          </p>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="glass-panel p-6 flex items-center gap-4 bg-slate-900/40 border-slate-800">
          <div className="p-3.5 bg-teal-500/10 text-teal-400 rounded-2xl">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Reports Logged</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white mt-1 block">
              {loading ? "..." : `${totalUploadedFiles} files`}
            </span>
          </div>
        </div>

        <div className="glass-panel p-6 flex items-center gap-4 bg-slate-900/40 border-slate-800">
          <div className="p-3.5 bg-blue-500/10 text-blue-400 rounded-2xl">
            <Sparkles size={24} />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Processed Records</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white mt-1 block">
              {loading ? "..." : `${totalRecordsProcessed} lines`}
            </span>
          </div>
        </div>

        <div className="glass-panel p-6 flex items-center gap-4 bg-slate-900/40 border-slate-800">
          <div className="p-3.5 bg-emerald-500/10 text-emerald-400 rounded-2xl">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Success Rate</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white mt-1 block">
              {loading ? "..." : totalRecordsProcessed > 0 ? `${Math.round((totalSuccessfulRecords / totalRecordsProcessed) * 100)}%` : "0%"}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar / Search */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-slate-900/30 p-4 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder="Search report archive by ID or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 border-l border-slate-850 pl-0 sm:pl-4">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition-colors ${viewMode === "grid" ? "bg-teal-500/10 text-teal-400" : "text-slate-500 hover:text-slate-350"}`}
          >
            <Grid size={18} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-lg transition-colors ${viewMode === "list" ? "bg-teal-500/10 text-teal-400" : "text-slate-500 hover:text-slate-350"}`}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Main Files Display */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="animate-spin text-teal-500" size={32} />
          <span className="text-sm text-slate-400">Scanning report archives...</span>
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
          <FileText className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-400 text-sm font-medium">No archived reports found.</p>
          <p className="text-slate-500 text-xs mt-1">Uploaded attendance logs will appear here as CSV files.</p>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBatches.map((batch) => {
            const logs = batchLogs[batch.id] || [];
            const isLogsLoading = loadingLogs[batch.id];
            
            return (
              <div 
                key={batch.id} 
                className="glass-panel p-6 flex flex-col justify-between hover:scale-[1.01] hover:border-slate-700/60 transition-all bg-slate-900/40 border-slate-800/80 group"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-500/15 transition-all">
                      <FileSpreadsheet size={24} />
                    </div>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${getStatusStyle(batch.status)}`}>
                      {batch.status}
                    </span>
                  </div>

                  <h3 className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm truncate mb-1">
                    attendance_log_{batch.id.substring(0, 8)}.csv
                  </h3>
                  
                  <div className="space-y-2 mt-4 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-slate-600" />
                      <span>{formatTimestamp(batch.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText size={12} className="text-slate-600" />
                      <span>
                        {isLogsLoading ? "Loading rows..." : `${logs.length} data rows`}
                      </span>
                    </div>
                    {batch.form_url && (
                      <div className="flex items-center gap-2">
                        <Link2 size={12} className="text-slate-600" />
                        <span className="truncate max-w-[200px]" title={batch.form_url}>
                          {batch.form_url}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-800/60">
                  <button
                    onClick={() => openPreview(batch)}
                    className="flex-1 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-800"
                  >
                    <Eye size={13} />
                    View
                  </button>
                  <button
                    disabled={logs.length === 0}
                    onClick={() => handleExportCSV(batch.id, logs)}
                    className="flex-1 py-2 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-teal-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Download size={13} />
                    Download
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="glass-panel overflow-hidden bg-slate-900/30 border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="py-4 px-6 font-semibold">File Name</th>
                  <th className="py-4 px-6 font-semibold">Run Timestamp</th>
                  <th className="py-4 px-6 font-semibold">Row Count</th>
                  <th className="py-4 px-6 font-semibold">Target Form</th>
                  <th className="py-4 px-6 font-semibold">Status</th>
                  <th className="py-4 px-6 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-sm">
                {filteredBatches.map((batch) => {
                  const logs = batchLogs[batch.id] || [];
                  const isLogsLoading = loadingLogs[batch.id];
                  
                  return (
                    <tr key={batch.id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="py-4 px-6 font-mono font-bold text-teal-500 dark:text-teal-400 flex items-center gap-2">
                        <FileSpreadsheet size={16} className="text-emerald-400" />
                        attendance_log_{batch.id.substring(0, 8)}.csv
                      </td>
                      <td className="py-4 px-6 text-slate-600 dark:text-slate-350">{formatTimestamp(batch.created_at)}</td>
                      <td className="py-4 px-6 text-slate-600 dark:text-slate-350 font-semibold">
                        {isLogsLoading ? "..." : logs.length}
                      </td>
                      <td className="py-4 px-6 text-slate-600 dark:text-slate-350 max-w-[200px] truncate" title={batch.form_url}>
                        {batch.form_url}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${getStatusStyle(batch.status)}`}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openPreview(batch)}
                            className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-slate-800"
                            title="Preview File"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            disabled={logs.length === 0}
                            onClick={() => handleExportCSV(batch.id, logs)}
                            className="p-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-teal-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Download CSV"
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      {showPreviewModal && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/40">
              <div>
                <h3 className="font-mono text-lg font-bold text-teal-400">
                  attendance_log_{selectedBatch.id.substring(0, 8)}.csv
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[500px] truncate">
                  Source ID: {selectedBatch.id} | Form: {selectedBatch.form_url}
                </p>
              </div>
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-950/20">
              {loadingLogs[selectedBatch.id] ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="animate-spin text-teal-500" size={24} />
                  <span className="text-xs text-slate-400">Reading file lines...</span>
                </div>
              ) : !batchLogs[selectedBatch.id] || batchLogs[selectedBatch.id].length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  This report has no data rows.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                        <th className="py-3 px-4">Line #</th>
                        <th className="py-3 px-4">Worker Name</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Project</th>
                        <th className="py-3 px-4">BOQ Category</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {batchLogs[selectedBatch.id].map((log, index) => (
                        <tr key={index} className="hover:bg-slate-900/30">
                          <td className="py-2.5 px-4 text-slate-600 font-mono">{index + 1}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-300">{log.worker_name}</td>
                          <td className="py-2.5 px-4 text-slate-400">{log.attendance_date}</td>
                          <td className="py-2.5 px-4 text-slate-400">{log.project_name}</td>
                          <td className="py-2.5 px-4 text-slate-400">{log.boq_category}</td>
                          <td className="py-2.5 px-4 text-slate-400">{log.duration}</td>
                          <td className="py-2.5 px-4">
                            <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                              log.status === "valid" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" : "bg-rose-500/10 text-rose-400 border border-rose-500/10"
                            }`}>
                              {log.status === "valid" ? "SUCCESS" : "FAILED"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end gap-3">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-850/80 text-slate-400 rounded-xl text-xs font-semibold cursor-pointer border border-slate-800"
              >
                Close
              </button>
              <button
                disabled={!batchLogs[selectedBatch.id] || batchLogs[selectedBatch.id].length === 0}
                onClick={() => {
                  handleExportCSV(selectedBatch.id, batchLogs[selectedBatch.id]);
                  setShowPreviewModal(false);
                }}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-650 text-slate-900 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30"
              >
                <Download size={14} />
                Export CSV Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

