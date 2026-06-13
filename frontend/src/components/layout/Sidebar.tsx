"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  UploadCloud, 
  GitCompare, 
  History, 
  FileBarChart, 
  Settings, 
  Sparkles,
  LogOut
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Upload Sheets", href: "/upload", icon: UploadCloud },
  { label: "Form Mapper", href: "/form-mapper", icon: GitCompare },
  { label: "History", href: "/history", icon: History },
  { label: "Reports", href: "/reports", icon: FileBarChart },
  { label: "Settings", href: "/settings", icon: Settings },
];

import { useAuthStore } from "@/lib/authStore";
import { useQueryClient } from "@tanstack/react-query";
import WorkSyncLogo from "@/components/layout/WorkSyncLogo";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    console.log("[SIDEBAR-LOGOUT] Step 1: Logout clicked");
    clearAuth();
    try {
      queryClient.clear();
    } catch (e) {
      console.warn("[SIDEBAR-LOGOUT] QueryClient clear error:", e);
    }
    window.location.replace("/login");
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 md:flex flex-col border-r border-slate-200/50 dark:border-slate-800/40 bg-white/40 dark:bg-slate-950/40 backdrop-blur-xl transition-all duration-300">
      <div className="flex h-16 items-center px-6 gap-2.5 border-b border-slate-200/50 dark:border-slate-800/40">
        <WorkSyncLogo className="w-8 h-8" />
        <span className="font-bold text-slate-800 dark:text-slate-100 tracking-tight">WorkSync</span>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                isActive
                  ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 border border-transparent"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Profile & Actions section */}
      <div className="p-4 pb-[60px] border-t border-slate-200/50 dark:border-slate-800/40 bg-slate-50/20 dark:bg-slate-900/10">
        <div className="flex items-center gap-3 px-2 py-3 mb-3 bg-slate-100/50 dark:bg-slate-900/40 rounded-2xl border border-slate-200/30 dark:border-slate-800/30">
          <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center justify-center font-bold text-sm shrink-0">
            {user?.email?.[0].toUpperCase() || "A"}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {user?.email || "Admin User"}
            </span>
            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider mt-0.5">
              {user?.role || "Administrator"}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
