"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileSpreadsheet, FileDown, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

import { getApiUrl } from "@/lib/api";

export default function UploadPage() {
  const router = useRouter();
  const [formUrl, setFormUrl] = useState("");
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationResults, setValidationResults] = useState<{ total: number; valid: number; issues: number } | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<{ id: string; form_url: string; status: string } | null>(null);

  useEffect(() => {
    async function checkActiveBatches() {
      try {
        const session_id = typeof window !== "undefined" ? sessionStorage.getItem("session_id") || "" : "";
        if (!session_id) return;
        const API_URL = getApiUrl();
        const res = await fetch(`${API_URL}/api/records/batches`, {
          headers: { "X-Session-ID": session_id },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.batches && data.batches.length > 0) {
            setActiveBatch(data.batches[0]);
          }
        }
      } catch (e) {
        console.error("Failed to fetch batches:", e);
      }
    }
    checkActiveBatches();
  }, []);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceFile) {
      setError("Attendance Excel file is required.");
      return;
    }

    setLoading(true);
    setError(null);
    setUploadProgress(0);
    setValidationResults(null);
    setBatchId(null);

    // Simulate upload progress for UI
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 15;
      });
    }, 200);

    const formData = new FormData();
    formData.append("file", attendanceFile);
    if (mappingFile) {
      formData.append("worker_mapping", mappingFile);
    }
    formData.append("form_url", formUrl);

    try {
      const session_id = typeof window !== "undefined" ? sessionStorage.getItem("session_id") || "" : "";
      const API_URL = getApiUrl();

      const res = await fetch(`${API_URL}/api/upload/attendance`, {
        method: "POST",
        headers: session_id ? { "X-Session-ID": session_id } : {},
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const detail = errData.detail || `Server error ${res.status}`;
        if (res.status === 401 || res.status === 403) {
          throw new Error("Session expired or not logged in. Please log in again.");
        }
        throw new Error(detail);
      }

      const data = await res.json();

      if (!data.batch_id) {
        throw new Error("Server did not return a batch ID.");
      }

      clearInterval(progressInterval);
      setUploadProgress(100);

      setValidationResults({
        total: data.total_records ?? 0,
        valid: data.valid_records ?? 0,
        issues: data.issues ?? 0,
      });
      setBatchId(data.batch_id);
      setLoading(false);

    } catch (err: any) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      setError(err?.message || "Upload failed. Check that the backend is running.");
      setLoading(false);
    }
  };

  const handleGeneratePreview = () => {
    if (batchId) {
      router.push(`/preview?batch_id=${batchId}`);
    }
  };

  return (
    <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">Upload Attendance Sheets</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Upload your month's site Excel report. The parsing engine will automatically detect worker columns and apply rules.
        </p>
      </div>

      {activeBatch && (
        <div className="glass-panel p-5 border-l-4 border-l-teal-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 block">
              Active Session Upload Detected
            </span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              You already have a sheet uploaded for target form:
            </p>
            <span className="text-xs text-slate-400 dark:text-slate-500 block truncate max-w-md">
              {activeBatch.form_url}
            </span>
          </div>
          <button
            onClick={() => router.push(`/preview?batch_id=${activeBatch.id}`)}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all"
          >
            Resume Submission & Preview
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleUploadSubmit} className="space-y-6">
        {/* Google Form Link */}
        <div className="glass-panel p-6 space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Google Form Target URL
          </label>
          <input
            type="url"
            required
            placeholder="https://docs.google.com/forms/d/e/.../viewform"
            className="w-full glass-input py-2.5 text-sm"
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* File Drag zones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Zone 1: Attendance Report */}
          <div className="glass-panel p-6 flex flex-col items-center justify-center min-h-[220px] text-center border-dashed border-2 border-slate-200/50 dark:border-slate-800/40 relative">
            <input
              type="file"
              id="attendance-upload"
              accept=".xlsx,.xls,.csv"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => setAttendanceFile(e.target.files?.[0] || null)}
              disabled={loading}
            />
            <div className="p-4 bg-teal-500/10 rounded-2xl text-teal-500 mb-4">
              <FileSpreadsheet size={32} />
            </div>
            {attendanceFile ? (
              <div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 block truncate max-w-[200px]">
                  {attendanceFile.name}
                </span>
                <span className="text-xs text-teal-500 mt-1 flex items-center justify-center gap-1">
                  <CheckCircle size={12} /> Ready
                </span>
              </div>
            ) : (
              <div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 block">
                  Labour Attendance Excel
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">
                  Drag & drop or click to upload
                </span>
              </div>
            )}
          </div>

          {/* Zone 2: Worker Mappings */}
          <div className="glass-panel p-6 flex flex-col items-center justify-center min-h-[220px] text-center border-dashed border-2 border-slate-200/50 dark:border-slate-800/40 relative">
            <input
              type="file"
              id="mapping-upload"
              accept=".xlsx,.xls,.csv"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => setMappingFile(e.target.files?.[0] || null)}
              disabled={loading}
            />
            <div className="p-4 bg-slate-500/10 rounded-2xl text-slate-500 dark:text-slate-400 mb-4">
              <FileSpreadsheet size={32} />
            </div>
            {mappingFile ? (
              <div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 block truncate max-w-[200px]">
                  {mappingFile.name}
                </span>
                <span className="text-xs text-teal-500 mt-1 flex items-center justify-center gap-1">
                  <CheckCircle size={12} /> Ready (Optional)
                </span>
              </div>
            ) : (
              <div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 block">
                  Worker Mapping Rules
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">
                  Optional. Drag & drop or click to replace
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Upload Progress & Validation Results */}
        {(loading || validationResults) && (
          <div className="glass-panel p-6 space-y-4 border-teal-500/30">
            {loading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-500">
                  <span>Uploading & Parsing...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-teal-500 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {validationResults && !loading && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <CheckCircle className="text-teal-500" size={18} />
                  Validation Results
                </h3>
                <div className="flex gap-6 text-sm">
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Total Records</span>
                    <span className="font-bold text-slate-800 dark:text-white text-lg">{validationResults.total}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-teal-600 text-xs uppercase tracking-wider font-semibold">Valid</span>
                    <span className="font-bold text-teal-600 text-lg">{validationResults.valid}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-amber-500 text-xs uppercase tracking-wider font-semibold">Issues Detected</span>
                    <span className="font-bold text-amber-500 text-lg">{validationResults.issues}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action button */}
        <div className="flex justify-end">
          {!validationResults ? (
            <button
              type="submit"
              disabled={loading || !attendanceFile || !formUrl}
              className="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:scale-100 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <UploadCloud size={16} />
                  Upload Sheets
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGeneratePreview}
              className="px-8 py-3.5 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white font-medium text-sm rounded-xl transition-all cursor-pointer shadow-lg shadow-teal-950/10 flex items-center gap-2"
            >
              Generate Preview
              <FileDown size={16} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
