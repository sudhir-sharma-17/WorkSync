"use client";

import React, { useState, useEffect } from "react";
import { History, FileDown, CheckCircle, XCircle, ArrowUpRight, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

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

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("session_id") || "";
}

function authHeaders(): Record<string, string> {
  const session_id = getSessionId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session_id) {
    headers["X-Session-ID"] = session_id;
  }
  return headers;
}

import { getApiUrl } from "@/lib/api";

export default function HistoryPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchLogs, setBatchLogs] = useState<Record<string, RecordDetail[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});

  const API_URL = getApiUrl();

  const fetchBatches = async () => {
    try {
      const res = await fetch(`${API_URL}/api/records/batches`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
      }
    } catch (e) {
      console.error("Error fetching batches:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [API_URL]);

  const toggleExpand = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      return;
    }
    setExpandedBatchId(batchId);

    if (!batchLogs[batchId] && !loadingLogs[batchId]) {
      setLoadingLogs(prev => ({ ...prev, [batchId]: true }));
      try {
        const res = await fetch(`${API_URL}/api/records/preview/${batchId}`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setBatchLogs(prev => ({ ...prev, [batchId]: data.records || [] }));
        }
      } catch (e) {
        console.error("Error fetching batch details:", e);
      } finally {
        setLoadingLogs(prev => ({ ...prev, [batchId]: false }));
      }
    }
  };

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
    a.setAttribute("download", `submission_history_${batchId}.csv`);
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

  return (
    <div className="space-y-8 relative z-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">Submission History</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Track previous automated fill records, debug form submission logs, and export status report sheets.
        </p>
      </div>

      <div className="glass-panel p-6 space-y-6 bg-[#0f172a]/70 backdrop-blur-xl border-slate-800">
        <div className="flex items-center gap-2">
          <History className="text-teal-600 dark:text-teal-400" size={20} />
          <h3 className="font-bold text-slate-800 dark:text-white">Batch Automation Archives</h3>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="animate-spin text-teal-500" size={28} />
            <span className="text-sm text-slate-400">Loading your history...</span>
          </div>
        ) : batches.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
            <p className="text-slate-400 text-sm">No batches found for this session.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/50 dark:border-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Batch ID</th>
                  <th className="py-3 px-4 font-semibold">Run Timestamp</th>
                  <th className="py-3 px-4 font-semibold">Total Records</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/30 text-sm">
                {batches.map((batch) => {
                  const isExpanded = expandedBatchId === batch.id;
                  const logs = batchLogs[batch.id] || [];
                  const isLogsLoading = loadingLogs[batch.id];
                  
                  return (
                    <React.Fragment key={batch.id}>
                      <tr className="hover:bg-slate-100/30 dark:hover:bg-slate-800/10 transition-all cursor-pointer" onClick={() => toggleExpand(batch.id)}>
                        <td className="py-4 px-4 font-mono font-bold text-teal-500 dark:text-teal-400 flex items-center gap-2">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          {batch.id.substring(0, 8)}...
                        </td>
                        <td className="py-4 px-4 text-slate-600 dark:text-slate-300">{formatTimestamp(batch.created_at)}</td>
                        <td className="py-4 px-4 font-semibold">
                          {isLogsLoading ? "..." : logs.length > 0 ? logs.length : "Click to view"}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            batch.status === "Completed" ? "bg-teal-500/10 text-teal-500" :
                            batch.status === "Failed" ? "bg-rose-500/10 text-rose-500" :
                            "bg-amber-500/10 text-amber-500"
                          }`}>
                            {batch.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={logs.length === 0}
                            onClick={() => handleExportCSV(batch.id, logs)}
                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-teal-500/10 hover:text-teal-500 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ml-auto disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <FileDown size={14} />
                            Export CSV
                          </button>
                        </td>
                      </tr>

                      {/* Expandable logs block */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="py-4 px-8 bg-slate-100/30 dark:bg-slate-900/30">
                            <div className="space-y-4">
                              <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <span>Detail Audit Logs</span>
                                <span className="font-mono text-[10px] text-slate-500 lowercase truncate max-w-sm">
                                  Target Form: {batch.form_url}
                                </span>
                              </div>
                              
                              {isLogsLoading ? (
                                <div className="flex items-center gap-2 py-4">
                                  <Loader2 className="animate-spin text-teal-500" size={16} />
                                  <span className="text-xs text-slate-400">Loading audit records...</span>
                                </div>
                              ) : logs.length === 0 ? (
                                <div className="text-xs text-slate-500 py-4">No records found for this batch.</div>
                              ) : (
                                <div className="divide-y divide-slate-100/50 dark:divide-slate-800/30">
                                  {logs.map((log, index) => (
                                    <div key={index} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                      <div className="flex items-center gap-3">
                                        {log.status === "valid" ? (
                                          <CheckCircle className="text-teal-500 shrink-0" size={16} />
                                        ) : (
                                          <XCircle className="text-rose-500 shrink-0" size={16} />
                                        )}
                                        <div className="flex flex-col">
                                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                                            {log.worker_name}
                                          </span>
                                          <span className="text-xs text-slate-400">
                                            Date: {log.attendance_date} | Project: {log.project_name} | Role: {log.worker_type}
                                          </span>
                                        </div>
                                      </div>
                                      {log.status === "valid" ? (
                                        <span className="text-xs text-teal-500 font-semibold">Form verification success</span>
                                      ) : (
                                        <span className="text-xs text-rose-400 font-semibold bg-rose-500/5 px-2.5 py-1 rounded-lg border border-rose-500/10">
                                          Error: {log.error_message || "Validation failed"}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
