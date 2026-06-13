"use client";

import React, { useState } from "react";
import { Settings, Save, Eye, Shield, Cpu, Sliders, Check } from "lucide-react";

export default function SettingsPage() {
  const [headless, setHeadless] = useState(true);
  const [timeout, setTimeoutVal] = useState("30000");
  const [visibleMode, setVisibleMode] = useState(false);
  const [retryLimit, setRetryLimit] = useState("3");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">System Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Adjust automated Playwright execution parameters, retry rules, and verification bounds.
        </p>
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
  );
}
