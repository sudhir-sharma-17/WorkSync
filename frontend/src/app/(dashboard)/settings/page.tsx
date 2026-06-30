"use client";

import React, { useState, useEffect } from "react";
import { Settings, Save, Eye, Shield, Cpu, Sliders, Check, Globe, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function SettingsPage() {
  const [headless, setHeadless] = useState(true);
  const [timeout, setTimeoutVal] = useState("30000");
  const [visibleMode, setVisibleMode] = useState(false);
  const [retryLimit, setRetryLimit] = useState("3");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Project catalog refresh states
  const [formUrlToRefresh, setFormUrlToRefresh] = useState("");
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);

  // Worker catalog refresh states
  const [refreshingWorkerCatalog, setRefreshingWorkerCatalog] = useState(false);
  const [refreshWorkerSuccess, setRefreshWorkerSuccess] = useState(false);

  // Google account session status
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null; connecting?: boolean }>({
    connected: false,
    email: null,
  });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Poll status helper
  const checkStatus = async () => {
    try {
      const data = await apiFetch("/api/automation/google/status");
      setGoogleStatus(data);
      return data;
    } catch (e) {
      console.error("Failed to load Google status:", e);
      return null;
    }
  };

  useEffect(() => {
    checkStatus().finally(() => setLoadingStatus(false));
  }, []);

  // Poll while connecting is active
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (connecting || googleStatus.connecting) {
      interval = setInterval(async () => {
        const data = await checkStatus();
        if (data && !data.connecting) {
          setConnecting(false);
          clearInterval(interval);
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connecting, googleStatus.connecting]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const data = await apiFetch("/api/automation/google/connect", { method: "POST" });
      setGoogleStatus(data);
    } catch (e) {
      console.error("Failed to connect Google account:", e);
      alert(e instanceof Error ? e.message : "Failed to connect Google account");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const data = await apiFetch("/api/automation/google/disconnect", { method: "POST" });
      setGoogleStatus(data);
    } catch (e) {
      console.error("Failed to disconnect Google account:", e);
      alert(e instanceof Error ? e.message : "Failed to disconnect Google account");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleRefreshCatalog = async () => {
    if (!formUrlToRefresh) return;
    setRefreshingCatalog(true);
    setRefreshSuccess(false);
    try {
      const data = await apiFetch("/api/records/project-catalog/refresh", {
        method: "POST",
        json: { form_url: formUrlToRefresh }
      });
      if (data.status === "success") {
        setRefreshSuccess(true);
        setTimeout(() => setRefreshSuccess(false), 5000);
      }
    } catch (e) {
      console.error("Failed to refresh catalog:", e);
      alert(e instanceof Error ? e.message : "Failed to refresh project catalog");
    } finally {
      setRefreshingCatalog(false);
    }
  };

  const handleRefreshWorkerCatalog = async () => {
    if (!formUrlToRefresh) return;
    setRefreshingWorkerCatalog(true);
    setRefreshWorkerSuccess(false);
    try {
      const data = await apiFetch("/api/records/worker-catalog/refresh", {
        method: "POST",
        json: { form_url: formUrlToRefresh }
      });
      if (data.status === "success") {
        setRefreshWorkerSuccess(true);
        setTimeout(() => setRefreshWorkerSuccess(false), 5000);
      }
    } catch (e) {
      console.error("Failed to refresh worker catalog:", e);
      alert(e instanceof Error ? e.message : "Failed to refresh worker catalog");
    } finally {
      setRefreshingWorkerCatalog(false);
    }
  };

  return (
    <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">System Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Adjust automated Playwright execution parameters, retry rules, and Google Account session status.
        </p>
      </div>

      <div className="space-y-6">
        {/* Google Connection Management Panel */}
        <div className="glass-panel p-6 space-y-6">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Globe className="text-teal-600 dark:text-teal-400" size={18} />
            Google Account Connection
          </h3>

          <div className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/50 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Google Connection Status
              </span>
              {loadingStatus ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Checking status...
                </div>
              ) : connecting || googleStatus.connecting ? (
                <div className="flex items-center gap-2 text-sm text-amber-500 font-medium">
                  <Loader2 size={14} className="animate-spin" /> Connecting... Please login in popup
                </div>
              ) : googleStatus.connected ? (
                <div>
                  <span className="text-sm font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                    <Check size={16} /> Connected
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                    Email: <span className="font-semibold">{googleStatus.email}</span>
                  </span>
                </div>
              ) : (
                <span className="text-sm font-bold text-rose-500">Not Connected</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {googleStatus.connected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="px-5 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl border border-rose-500/20 cursor-pointer transition-all disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting || googleStatus.connecting || loadingStatus}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl shadow-md shadow-teal-950/10 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {connecting && <Loader2 size={12} className="animate-spin" />}
                  {connecting ? "Opening Browser..." : "Connect Google Account"}
                </button>
              )}
            </div>
          </div>
          
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
            Note: Google authentication is completely temporary and session-based. Closing the WorkSync window or starting a New Session will automatically wipe all credentials, cookies, and active connection contexts.
          </p>
        </div>

        {/* Project Catalog Caching Management */}
        <div className="glass-panel p-6 space-y-6">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Cpu className="text-teal-600 dark:text-teal-400" size={18} />
            Project Catalog Cache Manager
          </h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Google Form URL
              </label>
              <input
                type="url"
                required
                placeholder="https://docs.google.com/forms/d/e/.../viewform"
                className="w-full glass-input text-sm"
                value={formUrlToRefresh}
                onChange={(e) => setFormUrlToRefresh(e.target.value)}
                disabled={refreshingCatalog || refreshingWorkerCatalog}
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
              <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-md">
                Refreshes the cached project dropdown list directly from the live Google Form dropdown. Use this when new project options are added to the form.
              </p>
              <button
                type="button"
                onClick={handleRefreshCatalog}
                disabled={refreshingCatalog || !formUrlToRefresh || refreshingWorkerCatalog}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl shadow-md shadow-teal-950/10 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-2 shrink-0 self-end sm:self-auto"
              >
                {refreshingCatalog ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {refreshingCatalog ? "Refreshing Catalog..." : "Refresh Project Catalog"}
              </button>
            </div>
            {refreshSuccess && (
              <p className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                <Check size={14} /> Project catalog successfully refreshed and cached!
              </p>
            )}
          </div>
        </div>

        {/* Worker Catalog Caching Management */}
        <div className="glass-panel p-6 space-y-6">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Cpu className="text-teal-600 dark:text-teal-400" size={18} />
            Worker Catalog Cache Manager
          </h3>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
              <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-md">
                Refreshes the cached worker dropdown list directly from the live Google Form dropdown. Use this when new worker options are added to the form.
              </p>
              <button
                type="button"
                onClick={handleRefreshWorkerCatalog}
                disabled={refreshingWorkerCatalog || !formUrlToRefresh || refreshingCatalog}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl shadow-md shadow-teal-950/10 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-2 shrink-0 self-end sm:self-auto"
              >
                {refreshingWorkerCatalog ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {refreshingWorkerCatalog ? "Refreshing Catalog..." : "Refresh Worker Catalog"}
              </button>
            </div>
            {refreshWorkerSuccess && (
              <p className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                <Check size={14} /> Worker catalog successfully refreshed and cached!
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Playwright Browser Runner Settings */}
          <div className="glass-panel p-6 space-y-6">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Cpu className="text-teal-600 dark:text-teal-400" size={18} />
              Playwright Browser Parameters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Command Timeout (ms)
                </label>
                <input
                  type="number"
                  className="w-full glass-input text-sm"
                  value={timeout}
                  onChange={(e) => setTimeoutVal(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Retry Threshold Limit
                </label>
                <input
                  type="number"
                  className="w-full glass-input text-sm"
                  value={retryLimit}
                  onChange={(e) => setRetryLimit(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Headless Execution Mode</span>
                  <span className="text-xs text-slate-400">Run browser in silent background mode</span>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                  checked={headless}
                  onChange={(e) => setHeadless(e.target.checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Debug Screen Recording</span>
                  <span className="text-xs text-slate-400">Capture visual flow output on form fill failures</span>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                  checked={visibleMode}
                  onChange={(e) => setVisibleMode(e.target.checked)}
                />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-xl flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md shadow-teal-950/10"
            >
              {saveSuccess ? <Check size={16} /> : <Save size={16} />}
              {saveSuccess ? "Configuration Saved!" : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
