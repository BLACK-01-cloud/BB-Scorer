"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User as UserIcon,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";
import { FALLBACK_ICON } from "@/lib/branding-constants";
import { createClient } from "@/lib/supabase/client";
import { useGlobalLoading } from "@/components/loading-provider";

const GENERIC_ERROR = "Invalid username or password";

export default function LoginForm({
  logoUrl = null,
  siteName = "BB Score",
}: {
  logoUrl?: string | null;
  siteName?: string;
} = {}) {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const queryError = search.get("error");

  const loading = useGlobalLoading();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        w-full max-w-md rounded-2xl p-7 sm:p-10 shadow-2xl
        bg-[rgba(29,16,10,0.72)] backdrop-blur-md
        border border-[rgba(169,138,125,0.2)]
      "
    >
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#b86432]/15 border border-[#b86432]/30 mb-5 overflow-hidden">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={siteName}
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <span className="text-5xl text-[#b86432] leading-none" aria-hidden>
              {FALLBACK_ICON}
            </span>
          )}
        </div>
        <h1 className="font-display text-[28px] sm:text-[32px] leading-tight font-bold text-[#f8ddd2] tracking-tight">
          Welcome to {siteName}
        </h1>
        <p className="mt-1.5 text-sm text-[#a98a7d]">
          Sign in to continue
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Username */}
        <div className="space-y-1.5">
          <label
            htmlFor="username"
            className="block ml-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#a98a7d]"
          >
            Username
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <UserIcon className="h-5 w-5 text-[#a98a7d] group-focus-within:text-[#b86432] transition-colors" />
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
              placeholder="username"
              className="
                w-full h-12 rounded-lg pl-12 pr-4
                bg-[#170b06] border border-[#5a4136]/30
                text-[#f8ddd2] placeholder:text-[#a98a7d]/50
                focus:ring-2 focus:ring-[#b86432] focus:border-transparent
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
            Password
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-[#a98a7d] group-focus-within:text-[#b86432] transition-colors" />
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
                focus:ring-2 focus:ring-[#b86432] focus:border-transparent
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
            w-full h-12 rounded-lg mt-2
            bg-[#b86432] hover:bg-[#9a5128]
            text-[#1d100a] font-display text-base font-bold uppercase tracking-[0.1em]
            flex items-center justify-center gap-2
            shadow-lg shadow-[#b86432]/20
            transition-all duration-200 active:scale-[0.98]
            disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          {submitting ? "Signing in…" : "Sign In"}
          {!submitting && <ArrowRight className="h-4 w-4" strokeWidth={2.5} />}
        </button>
      </form>
    </div>
  );
}
