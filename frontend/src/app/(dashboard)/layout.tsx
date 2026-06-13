"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/authStore";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import WorkSyncLogo from "@/components/layout/WorkSyncLogo";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token, user, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!token) {
      console.log("[LAYOUT] No token detected — redirecting to /login");
      window.location.replace("/login");
    } else {
      setChecking(false);
    }
  }, [token, mounted]);

  const handleLogout = () => {
    console.log("[MOBILE-LOGOUT] Step 1: Logout clicked");
    clearAuth();
    try {
      queryClient.clear();
    } catch (_) {}
    window.location.replace("/login");
  };

  // Prevent hydration mismatches by returning null during server-side render
  if (!mounted) return null;

  // Only show loader while we still have a valid session being verified
  if (checking && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-teal-500" size={32} />
          <span className="text-sm font-medium text-slate-400">Verifying session...</span>
        </div>
      </div>
    );
  }

  // If no token, render nothing while redirect fires
  if (!token) return null;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar - Desktop */}
      <Sidebar />

      {/* Main Content Pane */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen relative">
        <Topbar onMenuClick={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
        
        {/* Mobile Sidebar overlay */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-30 flex md:hidden bg-slate-950/60 backdrop-blur-sm">
            <div className="w-64 bg-slate-900 border-r border-slate-800 p-6 flex flex-col gap-6 h-full justify-between">
              <div className="flex flex-col gap-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <WorkSyncLogo className="w-8 h-8" />
                    <span className="font-bold text-white tracking-tight">WorkSync</span>
                  </div>
                  <button 
                    onClick={() => setMobileSidebarOpen(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <nav className="flex flex-col gap-4">
                  <a href="/dashboard" className="text-slate-300 hover:text-white">Dashboard</a>
                  <a href="/upload" className="text-slate-300 hover:text-white">Upload Sheets</a>
                  <a href="/form-mapper" className="text-slate-300 hover:text-white">Form Mapper</a>
                  <a href="/history" className="text-slate-300 hover:text-white">History</a>
                  <a href="/reports" className="text-slate-300 hover:text-white">Reports</a>
                  <a href="/settings" className="text-slate-300 hover:text-white">Settings</a>
                </nav>
              </div>

              {/* Bottom user profile & action drawer for mobile */}
              <div className="pt-4 pb-[60px] border-t border-slate-800">
                <div className="flex items-center gap-3 px-3 py-3 mb-4 bg-slate-950/40 rounded-xl border border-slate-800/60">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                    {user?.email?.[0].toUpperCase() || "A"}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-200 truncate">
                      {user?.email || "Admin User"}
                    </span>
                    <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider mt-0.5">
                      {user?.role || "Administrator"}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileSidebarOpen(false)} />
          </div>
        )}

        <main className="flex-1 p-6 md:p-8 bg-slate-50/50 dark:bg-slate-950/50 relative">
          <div className="radial-glow top-0 right-0 opacity-40" />
          {children}
        </main>
      </div>
    </div>
  );
}
