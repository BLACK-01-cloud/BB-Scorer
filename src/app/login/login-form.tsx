"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  User as UserIcon,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useGlobalLoading } from "@/components/loading-provider";

const GENERIC_ERROR = "Invalid username or password";

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const queryError = search.get("error");

  const loading = useGlobalLoading();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    queryError === "inactive"
      ? "Your account is inactive. Contact an administrator."
      : queryError === "forbidden"
      ? "You don't have access to that page."
      : null,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const stopLoading = loading.start("Signing in…");
    try {
      const supabase = createClient();

      const lookup = await supabase.rpc("get_login_email_by_username", {
        input_username: username.trim().toLowerCase(),
      });
      const email = (lookup.data as string | null) ?? null;
      if (lookup.error || !email) {
        setError(GENERIC_ERROR);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(GENERIC_ERROR);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sign-in succeeded but no session was created.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("role,status")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError("No profile found for this account.");
        return;
      }
      if (profile.status !== "active") {
        await supabase.auth.signOut();
        setError("Your account is inactive. Contact an administrator.");
        return;
      }

      const target =
        next ?? (profile.role === "admin" ? "/admin" : "/scorer/matches");
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      stopLoading();
      setSubmitting(false);
    }
  }

  return (
    <div
      className="
        w-full max-w-md rounded-xl p-6 sm:p-10 shadow-2xl
        bg-[rgba(29,16,10,0.7)] backdrop-blur-md
        border border-[rgba(169,138,125,0.2)]
        transition-transform duration-300
      "
    >
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-[#ff6b00]/20 border border-[#ff6b00]/30 mb-6">
          <ShieldCheck className="h-10 w-10 text-[#ff6b00]" strokeWidth={2} />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold text-[#f8ddd2] tracking-tight mb-1">
          Welcome to BB Score
        </h1>
        <p className="text-[#e2bfb0]/80 text-base">
          Official Staff Authentication Portal
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Username */}
        <div className="space-y-1.5">
          <label
            htmlFor="username"
            className="block ml-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#a98a7d]"
          >
            Staff Username
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <UserIcon className="h-5 w-5 text-[#a98a7d] group-focus-within:text-[#ff6b00] transition-colors" />
            </div>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="j.smith_stats"
              className="
                w-full h-12 rounded-lg pl-12 pr-4
                bg-[#170b06] border border-[#5a4136]/30
                text-[#f8ddd2] placeholder:text-[#a98a7d]/50
                focus:ring-2 focus:ring-[#ff6b00] focus:border-transparent
                outline-none transition-all
              "
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block ml-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#a98a7d]"
          >
            Secure Password
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-[#a98a7d] group-focus-within:text-[#ff6b00] transition-colors" />
            </div>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="
                w-full h-12 rounded-lg pl-12 pr-12
                bg-[#170b06] border border-[#5a4136]/30
                text-[#f8ddd2] placeholder:text-[#a98a7d]/50
                focus:ring-2 focus:ring-[#ff6b00] focus:border-transparent
                outline-none transition-all
              "
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#a98a7d] hover:text-[#f8ddd2] transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Remember + forgot */}
        <div className="flex items-center justify-between py-1">
          <label className="flex items-center gap-2.5 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="
                w-5 h-5 rounded border border-[#5a4136]
                bg-[#170b06] text-[#ff6b00]
                focus:ring-2 focus:ring-[#ff6b00] focus:ring-offset-0 focus:ring-offset-transparent
              "
            />
            <span className="text-sm text-[#e2bfb0] group-hover:text-[#f8ddd2] transition-colors">
              Remember session
            </span>
          </label>
          <a
            href="#"
            className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#ff6b00] hover:text-[#ffb693] transition-colors"
          >
            Forgot Access?
          </a>
        </div>

        {/* Error */}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="
            w-full h-12 rounded-lg
            bg-[#ff6b00] hover:bg-[#7a3000]
            text-[#351000] font-display text-2xl font-semibold uppercase tracking-tight
            flex items-center justify-center gap-2
            shadow-lg shadow-[#ff6b00]/20
            transition-all duration-200 active:scale-[0.98]
            disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          {submitting ? "Signing in…" : "Sign In"}
          {!submitting && <ArrowRight className="h-5 w-5" strokeWidth={2.5} />}
        </button>
      </form>

      {/* Bottom note */}
      <div className="mt-10 pt-6 border-t border-[#5a4136]/30 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#a98a7d]">
            Encrypted via BB-SECURE v4.2
          </span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a98a7d]/40 text-center">
          Authorized Personnel Only • IP logged on entry
        </p>
      </div>
    </div>
  );
}
