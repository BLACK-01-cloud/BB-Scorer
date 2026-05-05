import { Suspense } from "react";
import LoginForm from "./login-form";
import { loadBranding, FALLBACK_SITE_NAME, FALLBACK_ICON } from "@/lib/branding";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const branding = await loadBranding();
  const siteName = (branding.site_name || FALLBACK_SITE_NAME).toUpperCase();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#1d100a] text-[#f8ddd2] font-sans">
      {/* Full-bleed cinematic background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-t from-[#1d100a] via-[#1d100a]/60 to-black/40 z-10" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-bg.jpg"
          alt=""
          aria-hidden
          className="w-full h-full object-cover grayscale-[20%] contrast-125"
        />
      </div>

      {/* Top app bar */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="container flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            {branding.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logo_url}
                alt={siteName}
                className="h-7 w-7 rounded object-contain"
              />
            ) : (
              <span
                className="text-2xl text-[#ff6b00] leading-none"
                aria-hidden
              >
                {FALLBACK_ICON}
              </span>
            )}
            <span className="font-display tracking-tighter uppercase italic font-black text-[#ff6b00] text-xl">
              {siteName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle className="text-[#f8ddd2]" />
          </div>
        </div>
      </header>

      {/* Centered glass login card */}
      <section className="relative z-20 min-h-screen flex flex-col items-center justify-center px-4 py-24">
        <Suspense
          fallback={
            <div className="text-sm text-[#a98a7d]">Loading…</div>
          }
        >
          <LoginForm
            logoUrl={branding.logo_url ?? null}
            siteName={siteName}
          />
        </Suspense>
      </section>
    </main>
  );
}
