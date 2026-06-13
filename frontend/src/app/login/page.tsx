"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/authStore";
import { useQueryClient } from "@tanstack/react-query";
import WorkSyncLogo from "@/components/layout/WorkSyncLogo";
import { Lock, Mail, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, token } = useAuthStore();
  const queryClient = useQueryClient();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (token) {
      router.push("/dashboard");
    }
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Invalid credentials" }));
        throw new Error(data.detail || "Authentication failed");
      }

      const data = await res.json();
      
      // Save details to store
      setAuth(data.access_token, data.refresh_token || "", {
        id: data.user?.id || "admin-id",
        email: data.user?.email || email,
        role: data.user?.role || "admin",
      });

      // Clear ALL cached query data before navigating — prevents previous
      // user's data from leaking into the new session (multi-tenant isolation).
      queryClient.clear();

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 select-none overflow-hidden bg-[#0b0f19] text-slate-100">
      {/* Decorative Radial Glows */}
      <div className="radial-glow top-0 left-0 opacity-80" style={{ background: "radial-gradient(circle, rgba(20, 184, 166, 0.15) 0%, rgba(2, 132, 199, 0.05) 50%, rgba(0, 0, 0, 0) 100%)" }} />
      <div className="radial-glow bottom-0 right-0 opacity-80" style={{ background: "radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, rgba(13, 148, 136, 0.05) 50%, rgba(0, 0, 0, 0) 100%)" }} />

      <div className="w-full max-w-md glass-panel p-8 relative z-10 border-slate-800 bg-[#0f172a]/70 backdrop-blur-xl">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <WorkSyncLogo className="w-16 h-16" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
            WorkSync
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 font-medium">Sign in to control sheet automation</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-500/70" size={18} />
              <input
                type="email"
                required
                className="w-full pr-4 py-3 glass-input text-white text-sm border-slate-700/50 focus:border-teal-500/50 transition-all duration-300"
                style={{ paddingLeft: "2.75rem" }}
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-500/70" size={18} />
              <input
                type="password"
                required
                className="w-full pr-4 py-3 glass-input text-white text-sm border-slate-700/50 focus:border-teal-500/50 transition-all duration-300"
                style={{ paddingLeft: "2.75rem" }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 mt-2">
            <input
              type="checkbox"
              id="rememberMe"
              className="w-4 h-4 rounded border-slate-700 bg-slate-900/60 accent-teal-500 cursor-pointer"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
            />
            <label htmlFor="rememberMe" className="text-xs text-slate-400 cursor-pointer select-none hover:text-slate-300 transition-colors font-medium">
              Remember me
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 active:scale-[0.98] disabled:scale-100 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-teal-400 hover:text-teal-300 font-bold transition-colors">
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
}
