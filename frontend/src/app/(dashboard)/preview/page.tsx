"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  X,
  ChevronRight,
  Loader2,
  Clock,
  Search,
  Filter,
  Edit2,
  ChevronLeft,
  Square,
  Check,
  XCircle,
  FileDown,
  ShieldCheck,
  ShieldAlert,
  Zap,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ────────────────────────────────────────────────────────────────────

interface PreviewRecord {
  id: string;
  attendance_date: string;
  worker_name: string;
  worker_type?: string;
  project_name: string;
  boq_category: string;
  duration: string;
  description: string;
  status: "valid" | "warning" | "invalid";
  error_message?: string;
}

interface ValidationReport {
  passed: boolean;
  form_url: string;
  fields_detected: number;
  found: string[];
  missing: string[];
  message: string;
}

interface BatchStatus {
  batch_status: string;
  total: number;
  submitted: number;
  failed: number;
  pending: number;
  progress_pct: number;
  logs: string[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("token") || "";
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

const FIELD_LABELS: Record<string, string> = {
  attendance_date: "Attendance Date",
  worker_name: "Worker Name",
  project_name: "Project Name",
  boq_category: "BOQ Category",
  duration: "Duration",
  description: "Description",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch_id") || "";

  // Data
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [records, setRecords] = useState<PreviewRecord[]>([]);
  const [formUrl, setFormUrl] = useState("");
  const [debugMeta, setDebugMeta] = useState<any>(null);

  // Validation
  const [validating, setValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);

  // Submission flow
  const [mode, setMode] = useState<"dry_run" | "test" | "production">("test");
  type FlowStatus = "idle" | "validated" | "submitting" | "completed" | "cancelled" | "failed";
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle");

  // Live monitor state (from real API polling)
  const [liveStatus, setLiveStatus] = useState<BatchStatus | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Table controls
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;

  // Edit modal
  const [editingRecord, setEditingRecord] = useState<PreviewRecord | null>(null);

  // ── Load preview data ────────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      if (!batchId) {
        setLoadError("No batch ID provided. Please upload an attendance sheet first.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/records/preview/${batchId}`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setRecords(data.records || []);
          setFormUrl(data.form_url || "");
          setDebugMeta(data.debug_meta || null);
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Server returned ${res.status}`);
        }
      } catch (err: any) {
        setLoadError(err?.message || "Failed to load preview data.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [batchId]);

  // ── Polling live status ──────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/automation/status/${batchId}`, {
          headers: authHeaders(),
        });
        if (!res.ok) return;
        const data: BatchStatus = await res.json();
        setLiveStatus(data);

        const done = ["Completed", "Failed", "Cancelled"].includes(data.batch_status);
        if (done) {
          clearInterval(pollRef.current!);
          setFlowStatus(
            data.batch_status === "Completed" ? "completed" :
            data.batch_status === "Cancelled" ? "cancelled" : "failed"
          );
        }
      } catch {}
    }, 2000);
  }, [batchId]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Derived data ─────────────────────────────────────────────────────────
  const validRecords = useMemo(() => records.filter((r) => r.status !== "invalid"), [records]);

  const filteredRecords = useMemo(() =>
    records.filter((r) => {
      const matchesSearch =
        r.worker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.project_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === "all" || r.status === filterStatus;
      return matchesSearch && matchesStatus;
    }), [records, searchQuery, filterStatus]);

  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * recordsPerPage,
    currentPage * recordsPerPage
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleValidateForm = async () => {
    if (!formUrl) return;
    setValidating(true);
    setValidationReport(null);
    try {
      const res = await fetch(`${API_URL}/api/automation/validate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ form_url: formUrl }),
      });
      const data: ValidationReport = await res.json();
      setValidationReport(data);
      if (data.passed) setFlowStatus("validated");
    } catch (err: any) {
      setValidationReport({
        passed: false,
        form_url: formUrl,
        fields_detected: 0,
        found: [],
        missing: [],
        message: `Network error: ${err?.message}`,
      });
    } finally {
      setValidating(false);
    }
  };

  const handleStartSubmission = async () => {
    setFlowStatus("submitting");
    setLiveStatus(null);
    try {
      const res = await fetch(`${API_URL}/api/automation/run`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ batch_id: batchId, mode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to start submission.");
      }
      if (mode !== "dry_run") startPolling();
      else {
        const data = await res.json();
        setLiveStatus({ batch_status: "Completed", total: data.would_submit, submitted: data.would_submit, failed: 0, pending: 0, progress_pct: 100, logs: ["[DRY RUN]: No actual submissions made."] });
        setFlowStatus("completed");
      }
    } catch (err: any) {
      setFlowStatus("failed");
    }
  };

  const handlePause = async () => {
    await fetch(`${API_URL}/api/automation/pause/${batchId}`, { method: "POST", headers: authHeaders() });
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleCancel = async () => {
    await fetch(`${API_URL}/api/automation/cancel/${batchId}`, { method: "POST", headers: authHeaders() });
    if (pollRef.current) clearInterval(pollRef.current);
    setFlowStatus("cancelled");
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRecord) {
      setRecords(records.map((r) => (r.id === editingRecord.id ? editingRecord : r)));
      setEditingRecord(null);
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("Attendance Preview Report", 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

    const tableColumn = ["Date", "Worker", "Project", "Category", "Description", "Duration", "Status"];
    const tableRows = filteredRecords.map((r) => [
      r.attendance_date, r.worker_name, r.project_name,
      r.boq_category || "—", r.description || "—", r.duration, r.status.toUpperCase(),
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 38,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [20, 184, 166], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 6: { fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          if (data.cell.raw === "VALID") data.cell.styles.textColor = [13, 148, 136];
          else if (data.cell.raw === "INVALID") data.cell.styles.textColor = [225, 29, 72];
        }
      },
    });
    doc.save(`attendance_preview_${batchId.substring(0, 8)}.pdf`);
  };

  const getStatusBadge = (s: PreviewRecord["status"]) => {
    const map = {
      valid: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
      warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      invalid: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[s]}`}>
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </span>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 relative z-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">
            Preview Records
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Validate your Google Form first, then approve to submit.
          </p>
        </div>

        {/* Action bar — only when idle or validated */}
        {!loadError && !loading && records.length > 0 && flowStatus !== "submitting" && flowStatus !== "completed" && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Mode selector */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              {(["dry_run", "test", "production"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    mode === m
                      ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {m === "dry_run" ? "Dry Run" : m === "test" ? "Test (5)" : "Production"}
                </button>
              ))}
            </div>

            {/* Validate Form button */}
            <button
              onClick={handleValidateForm}
              disabled={validating || !formUrl}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-md"
            >
              {validating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {validating ? "Validating…" : "Validate Form"}
            </button>

            {/* Submit button — only unlocks after validation passes */}
            <button
              onClick={handleStartSubmission}
              disabled={flowStatus !== "validated"}
              title={flowStatus !== "validated" ? "Run 'Validate Form' first" : ""}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md"
            >
              <Zap size={16} />
              {mode === "dry_run" ? "Execute Dry Run" : "Approve & Submit"}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="min-h-[300px] flex items-center justify-center">
          <Loader2 className="animate-spin text-teal-500" size={32} />
        </div>
      ) : loadError ? (
        <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 glass-panel p-10">
          <AlertTriangle size={40} className="text-amber-500" />
          <p className="text-slate-700 dark:text-slate-200 font-semibold text-center max-w-md">{loadError}</p>
          <button
            onClick={() => router.push("/upload")}
            className="mt-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-xl cursor-pointer"
          >
            Go to Upload
          </button>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Validation Report Panel */}
          {validationReport && (
            <div className={`glass-panel p-5 border-l-4 animate-in fade-in duration-300 ${
              validationReport.passed ? "border-l-teal-500" : "border-l-rose-500"
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {validationReport.passed
                    ? <ShieldCheck size={24} className="text-teal-500 shrink-0" />
                    : <ShieldAlert size={24} className="text-rose-500 shrink-0" />
                  }
                  <div>
                    <h3 className={`font-bold text-base ${validationReport.passed ? "text-teal-700 dark:text-teal-300" : "text-rose-700 dark:text-rose-300"}`}>
                      {validationReport.passed ? "Form Validation Passed" : "Form Validation Failed"}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{validationReport.message}</p>
                  </div>
                </div>
                <button onClick={() => setValidationReport(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white shrink-0">
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Found fields */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Detected Fields ({validationReport.found.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {validationReport.found.map((f) => (
                      <span key={f} className="flex items-center gap-1 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs px-2 py-0.5 rounded-full font-medium">
                        <Check size={10} /> {FIELD_LABELS[f] || f}
                      </span>
                    ))}
                    {validationReport.found.length === 0 && <span className="text-slate-400 text-xs">None</span>}
                  </div>
                </div>

                {/* Missing fields */}
                {validationReport.missing.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-2">
                      Missing Fields ({validationReport.missing.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {validationReport.missing.map((f) => (
                        <span key={f} className="flex items-center gap-1 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs px-2 py-0.5 rounded-full font-medium">
                          <XCircle size={10} /> {FIELD_LABELS[f] || f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Debug Summary Panel */}
          {debugMeta && (
            <div className="glass-panel p-5 border-l-4 border-l-indigo-500 shadow-sm animate-in fade-in duration-500">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <Search size={16} className="text-indigo-500" />
                Parser Audit
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Unique Workers</div>
                  <div className="text-xl font-bold text-slate-800 dark:text-white">{debugMeta?.parser?.unique_workers?.length || 0}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Raw Entries</div>
                  <div className="text-xl font-bold text-slate-800 dark:text-white">{debugMeta?.parser?.total_extracted_raw || 0}</div>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider mb-1">Generated</div>
                  <div className="text-xl font-bold text-indigo-700 dark:text-indigo-300">{debugMeta?.rules?.total_after_expansion || 0}</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider mb-1">Duplicates</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{debugMeta?.rules?.duplicates_detected || 0}</div>
                </div>
                <div className="col-span-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Code Breakdown</div>
                  <div className="flex gap-2 flex-wrap text-xs font-semibold">
                    <span className="bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300 px-2 py-0.5 rounded">P: {debugMeta?.parser?.attendance_codes?.P || 0}</span>
                    <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 px-2 py-0.5 rounded">P.5: {debugMeta?.parser?.attendance_codes?.["P.5"] || 0}</span>
                    <span className="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 px-2 py-0.5 rounded">PP: {debugMeta?.parser?.attendance_codes?.PP || 0}</span>
                    <span className="bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">A: {debugMeta?.parser?.attendance_codes?.A || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* ── Left: Records Table ─────────────────────────────── */}
            <div className="xl:col-span-3 glass-panel p-6 flex flex-col min-h-[500px]">

              {/* Search + Filter + PDF */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search by worker or project..."
                    className="w-full pl-9 pr-4 py-2 glass-input text-sm"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  />
                </div>
                <div className="relative w-full sm:w-48">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select
                    className="w-full pl-9 pr-4 py-2 glass-input text-sm appearance-none bg-transparent cursor-pointer"
                    value={filterStatus}
                    onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                  >
                    <option value="all" className="bg-slate-900">All Statuses</option>
                    <option value="valid" className="bg-slate-900">Valid Only</option>
                    <option value="warning" className="bg-slate-900">Warnings</option>
                    <option value="invalid" className="bg-slate-900">Invalid / Errors</option>
                  </select>
                </div>
                <button
                  onClick={handleDownloadPDF}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  <FileDown size={16} /> Download PDF
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/50 dark:border-slate-800/50 text-slate-400 text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4 font-semibold">Date</th>
                      <th className="py-3 px-4 font-semibold">Worker</th>
                      <th className="py-3 px-4 font-semibold">Project</th>
                      <th className="py-3 px-4 font-semibold">BOQ Category</th>
                      <th className="py-3 px-4 font-semibold">Description</th>
                      <th className="py-3 px-4 font-semibold">Duration</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/30 text-sm">
                    {paginatedRecords.length > 0 ? (
                      paginatedRecords.map((record) => (
                        <tr key={record.id} className="hover:bg-slate-100/30 dark:hover:bg-slate-800/10 transition-all">
                          <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{record.attendance_date}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800 dark:text-white whitespace-nowrap">{record.worker_name}</td>
                          <td className="py-3 px-4 whitespace-nowrap">{record.project_name}</td>
                          <td className="py-3 px-4 text-xs">{record.boq_category || "—"}</td>
                          <td className="py-3 px-4 text-xs">{record.description || "—"}</td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap">{record.duration}</td>
                          <td className="py-3 px-4">{getStatusBadge(record.status)}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setEditingRecord(record)}
                              className="p-1.5 text-slate-400 hover:text-teal-500 hover:bg-teal-500/10 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500 text-sm">
                          {records.length === 0 ? "No records found for this batch." : "No records match your filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {filteredRecords.length === 0
                    ? "0 records"
                    : `Showing ${(currentPage - 1) * recordsPerPage + 1}–${Math.min(currentPage * recordsPerPage, filteredRecords.length)} of ${filteredRecords.length}`}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Right: Submission Monitor ──────────────────────── */}
            <div className="glass-panel p-6 flex flex-col h-full">
              <h3 className="font-bold text-slate-800 dark:text-white mb-6">Submission Monitor</h3>

              {flowStatus === "idle" && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 p-6 text-center gap-3">
                  <ShieldCheck size={32} className="opacity-30" />
                  <span className="text-xs">
                    Click <strong>"Validate Form"</strong> first<br />
                    to check your Google Form, then submit.
                  </span>
                </div>
              )}

              {flowStatus === "validated" && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 border border-dashed border-teal-300 dark:border-teal-800 rounded-xl bg-teal-50/30 dark:bg-teal-900/10 p-6 text-center gap-3">
                  <CheckCircle size={32} className="text-teal-500" />
                  <span className="text-xs text-teal-700 dark:text-teal-400">
                    Validation passed!<br />
                    Click <strong>"Approve & Submit"</strong> to start.
                  </span>
                </div>
              )}

              {(flowStatus === "submitting" || flowStatus === "completed" || flowStatus === "cancelled" || flowStatus === "failed") && liveStatus && (
                <div className="space-y-5 flex-1 flex flex-col animate-in fade-in zoom-in-95 duration-300">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-100 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-teal-600 dark:text-teal-400 mb-1">
                        <Check size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Submitted</span>
                      </div>
                      <span className="text-2xl font-bold text-slate-800 dark:text-white">{liveStatus.submitted}</span>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 mb-1">
                        <XCircle size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Failed</span>
                      </div>
                      <span className="text-2xl font-bold text-slate-800 dark:text-white">{liveStatus.failed}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className={`uppercase tracking-wider ${
                        flowStatus === "completed" ? "text-teal-500" :
                        flowStatus === "failed" ? "text-rose-500" :
                        flowStatus === "cancelled" ? "text-amber-500" : "text-teal-400"
                      }`}>
                        {liveStatus.batch_status}
                      </span>
                      <span>{liveStatus.progress_pct}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          flowStatus === "cancelled" ? "bg-amber-500" :
                          flowStatus === "failed" ? "bg-rose-500" : "bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.8)]"
                        }`}
                        style={{ width: `${liveStatus.progress_pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 text-right">
                      {liveStatus.submitted + liveStatus.failed} / {liveStatus.total} processed
                    </div>
                  </div>

                  {/* Live Logs */}
                  <div className="flex-1 flex flex-col min-h-[160px]">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Live Output</span>
                    <div className="bg-slate-950 flex-1 border border-slate-800 rounded-xl p-4 overflow-y-auto font-mono text-[10px] text-teal-400 space-y-1.5 scrollbar-none shadow-inner max-h-[220px]">
                      {liveStatus.logs.map((log, i) => (
                        <div key={i} className="flex gap-2 leading-relaxed">
                          <span className="text-slate-600">❯</span>
                          <span className={`opacity-90 ${log.includes("[ERROR]") ? "text-rose-400" : log.includes("[DRY") ? "text-slate-300" : ""}`}>
                            {log}
                          </span>
                        </div>
                      ))}
                      {liveStatus.logs.length === 0 && (
                        <div className="flex gap-2 text-slate-600">
                          <span>❯</span><span>Waiting for submissions…</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="grid grid-cols-2 gap-3">
                    {flowStatus === "submitting" && (
                      <>
                        <button
                          onClick={handlePause}
                          className="py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Pause size={14} /> Pause
                        </button>
                        <button
                          onClick={handleCancel}
                          className="py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Square size={14} /> Cancel
                        </button>
                      </>
                    )}
                    {(flowStatus === "completed" || flowStatus === "cancelled" || flowStatus === "failed") && (
                      <button
                        onClick={() => router.push("/history")}
                        className="col-span-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                      >
                        View Final Report <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Dry run completed without live status */}
              {flowStatus === "completed" && !liveStatus && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <CheckCircle size={40} className="text-teal-500" />
                  <p className="text-sm text-slate-500">Dry run completed.</p>
                  <button onClick={() => router.push("/history")} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-xl cursor-pointer">
                    View History
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md bg-white/90 dark:bg-slate-900/90 shadow-2xl p-6 relative">
            <button onClick={() => setEditingRecord(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <X size={18} />
            </button>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6">Edit Record</h2>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Worker Name</label>
                <input
                  type="text"
                  value={editingRecord.worker_name}
                  onChange={(e) => setEditingRecord({ ...editingRecord, worker_name: e.target.value })}
                  className="w-full glass-input text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Project Name</label>
                <input
                  type="text"
                  value={editingRecord.project_name}
                  onChange={(e) => setEditingRecord({ ...editingRecord, project_name: e.target.value })}
                  className="w-full glass-input text-sm"
                  required
                />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingRecord(null)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg shadow-lg cursor-pointer">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
