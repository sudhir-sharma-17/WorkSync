"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu } from "lucide-react";
import Link from "next/link";

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  // Dynamic Breadcrumb Generator
  const getBreadcrumbs = () => {
    const paths = pathname.split("/").filter(Boolean);
    if (paths.length === 0) return [{ label: "Home", href: "/" }];
    
    return paths.map((path, idx) => {
      const href = "/" + paths.slice(0, idx + 1).join("/");
      const label = path
        .replace(/-/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
      return { label, href };
    });
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200/50 dark:border-slate-800/40 bg-white/40 dark:bg-slate-950/40 backdrop-blur-xl px-6 select-none">
      {/* Left pane: Mobile Menu toggle & Breadcrumbs */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 md:hidden rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
        >
          <Menu size={20} />
        </button>

        {/* Dynamic Breadcrumbs */}
        <nav className="hidden sm:flex items-center space-x-1.5 text-xs font-semibold text-slate-400">
          <Link href="/dashboard" className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            Console
          </Link>
          {breadcrumbs.map((bc, idx) => (
            <React.Fragment key={idx}>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              {idx === breadcrumbs.length - 1 ? (
                <span className="text-teal-600 dark:text-teal-400 font-bold">{bc.label}</span>
              ) : (
                <Link href={bc.href} className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  {bc.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4 relative">
        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 rounded-xl border border-slate-200/50 dark:border-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 text-slate-500 dark:text-slate-400 transition-all cursor-pointer relative w-9 h-9 flex items-center justify-center"
        >
          <Sun size={18} className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon size={18} className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-sky-400" />
        </button>
      </div>
    </header>
  );
}
