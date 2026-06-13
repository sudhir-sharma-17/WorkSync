"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/authStore";
import { Lock, Mail, Loader2, Sparkles, Eye, EyeOff, User } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { setAuth, token } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (token) router.push("/dashboard");
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Registration failed." }));
        throw new Error(data.detail || "Registration failed.");
      }

      const data = await res.json();

      setAuth(data.access_token, data.refresh_token || "", {
        id: data.user?.id || "admin-id",
        email: data.user?.email || email,
        role: data.user?.role || "admin",
      });

      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 select-none overflow-hidden bg-slate-900 text-slate-100">
      {/* Decorative Radial Glows */}
      <div className="radial-glow top-10 left-10 opacity-70" />
      <div
        className="radial-glow bottom-10 right-10 opacity-70"
        style={{ background: "radial-gradient(circle, rgba(2, 132, 199, 0.1) 0%, rgba(13, 148, 136, 0.05) 50%, rgba(0, 0, 0, 0) 100%)" }}
      />

      <div className="w-full max-w-md glass-panel p-8 relative z-10 border-slate-800">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-teal-500/10 rounded-2xl border border-teal-500/30 mb-3 text-teal-400">
            <Sparkles size={32} className="animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Create Account</h1>
          <p className="text-sm text-slate-400 mt-1">Set up your admin access</p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        {/* Success Banner */}
        {success && (
          <div className="mb-6 p-4 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm flex items-center gap-2">
            <Sparkles size={16} />
            Account created! Redirecting to dashboard...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="email"
                required
                className="w-full pl-10 pr-4 py-3 glass-input text-white text-sm"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                required
                className="w-full pl-10 pr-10 py-3 glass-input text-white text-sm"
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                required
                className={`w-full pl-10 pr-4 py-3 glass-input text-white text-sm ${
                  confirmPassword && confirmPassword !== password
                    ? "border-rose-500/50 focus:border-rose-500"
                    : confirmPassword && confirmPassword === password
                    ? "border-teal-500/50"
                    : ""
                }`}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              {confirmPassword && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {confirmPassword === password ? (
                    <span className="text-teal-500 text-xs font-semibold">✓</span>
                  ) : (
                    <span className="text-rose-500 text-xs font-semibold">✗</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || success}
            className="w-full mt-2 py-3 px-4 bg-teal-600 hover:bg-teal-500 active:scale-95 disabled:scale-100 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-950/20"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating Account...
              </>
            ) : (
              <>
                <User size={16} />
                Create Account
              </>
            )}
          </button>
        </form>

        {/* Redirect to Login */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-teal-400 hover:text-teal-300 font-semibold transition-colors">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
