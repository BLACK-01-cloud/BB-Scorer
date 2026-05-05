import Link from "next/link";
import {
  loadBranding,
  FALLBACK_SITE_NAME,
  FALLBACK_ICON,
} from "@/lib/branding";
import { ThemeToggle } from "@/components/theme-toggle";
import { TopNavLinks } from "./top-nav-links";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type NavSection = "live" | "scorer" | "admin";

export async function TopAppBar({
  active,
  rightSlot,
  homeHref = "/",
  className,
}: {
  active: NavSection;
  rightSlot?: ReactNode;
  homeHref?: string;
  className?: string;
}) {
  const branding = await loadBranding();
  const siteName = (branding.site_name || FALLBACK_SITE_NAME).toUpperCase();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur-md",
        className,
      )}
    >
      <div className="container flex h-16 items-center gap-3 px-4 md:px-8">
        <Link
          href={homeHref}
          className="flex items-center gap-2 min-w-0 flex-1"
          title={siteName}
        >
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo_url}
              alt={siteName}
              className="h-7 w-7 rounded object-contain shrink-0"
            />
          ) : (
            <span
              className="text-2xl text-primary leading-none shrink-0"
              aria-hidden
            >
              {FALLBACK_ICON}
            </span>
          )}
          <span className="brand-mark text-primary text-lg sm:text-xl md:text-2xl truncate min-w-0">
            {siteName}
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3 md:gap-5 shrink-0">
          <TopNavLinks active={active} />
          <ThemeToggle />
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
