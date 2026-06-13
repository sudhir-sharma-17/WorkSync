"use client";

import React, { useState, useEffect } from "react";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp, 
  ArrowUpRight,
  Activity,
  Layers,
  Loader2
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid 
} from "recharts";

interface Batch {
  id: string;
  status: string;
  form_url: string;
  created_at: string;
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

export default function DashboardPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = getApiUrl();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/records/batches`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setBatches(data.batches || []);
        }
      } catch (e) {
        console.error("Error fetching dashboard stats:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [API_URL]);

  const totalRuns = batches.length;
  const completedRuns = batches.filter(b => b.status === "Completed").length;
  const failedRuns = batches.filter(b => b.status === "Failed").length;
  const pendingRuns = batches.filter(b => b.status === "Pending" || b.status === "Processing").length;

  const kpis = [
    { label: "Total Runs", value: totalRuns.toString(), change: "All uploads", icon: Layers, color: "text-teal-500", bg: "bg-teal-500/10" },
    { label: "Completed Runs", value: completedRuns.toString(), change: "Successfully filled", icon: CheckCircle, color: "text-teal-500", bg: "bg-teal-500/10" },
    { label: "Failed Runs", value: failedRuns.toString(), change: "Required attention", icon: XCircle, color: "text-rose-500", bg: "bg-rose-500/10" },
    { label: "Pending Processing", value: pendingRuns.toString(), change: "Running automations", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  // Dynamic chart data based on last 7 runs or status distribution
  const chartData = [
    { name: "Total", count: totalRuns },
    { name: "Completed", count: completedRuns },
    { name: "Failed", count: failedRuns },
    { name: "Pending", count: pendingRuns },
  ];

  return (
    <div className="space-y-8 relative z-10">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time status of your Google Form automated submissions and worker mapping logs.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="animate-spin text-teal-500" size={36} />
          <span className="text-sm text-slate-400 font-medium">Loading session workspace...</span>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {kpis.map((kpi, i) => {
              const Icon = kpi.icon;
              return (
                <div key={i} className="glass-panel glass-panel-hover p-6 bg-[#0f172a]/70 border-slate-800">
                  <div className="flex justify-between items-start">
                    <div className={`p-3 rounded-2xl ${kpi.bg} ${kpi.color}`}>
                      <Icon size={24} />
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                      {kpi.change}
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-white">{kpi.value}</h3>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{kpi.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Charts & Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Success vs Failure Chart */}
            <div className="glass-panel p-6 lg:col-span-2 flex flex-col bg-[#0f172a]/70 border-slate-800">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-teal-600 dark:text-teal-400" size={20} />
                  <h3 className="font-bold text-slate-800 dark:text-white">Run Statistics</h3>
                </div>
                <span className="text-xs text-slate-400">Current Session</span>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ 
                        background: "rgba(15, 23, 42, 0.9)", 
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "12px",
                        color: "#f8fafc"
                      }} 
                    />
                    <Bar dataKey="count" fill="var(--accent-teal)" radius={[4, 4, 0, 0]} name="Batches Count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Activity Log */}
            <div className="glass-panel p-6 bg-[#0f172a]/70 border-slate-800">
              <div className="flex items-center gap-2 mb-6">
                <Activity className="text-teal-600 dark:text-teal-400" size={20} />
                <h3 className="font-bold text-slate-800 dark:text-white">Recent Runs</h3>
              </div>

              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                {batches.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500">No recent activity.</div>
                ) : (
                  batches.slice(0, 5).map((batch) => (
                    <div 
                      key={batch.id} 
                      className="flex items-start justify-between gap-4 p-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-800/20 transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-800/30"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                          Batch #{batch.id.substring(0, 8)}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Status: {batch.status}
                        </span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-bold ${
                        batch.status === "Completed" ? "bg-teal-500/10 text-teal-400" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {batch.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
