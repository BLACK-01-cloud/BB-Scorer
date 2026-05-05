"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScanLine, ShieldCheck, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Live", Icon: Trophy, match: (p: string) => p === "/" || p.startsWith("/live") },
  { href: "/scorer/matches", label: "Scorer", Icon: ScanLine, match: (p: string) => p.startsWith("/scorer") },
  { href: "/admin", label: "Admin", Icon: ShieldCheck, match: (p: string) => p.startsWith("/admin") },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden h-20 px-2 bg-background/95 backdrop-blur-md border-t border-border/70 shadow-[0_-4px_12px_rgba(0,0,0,0.35)]">
      <div className="grid grid-cols-3 h-full">
        {items.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-3 mx-2 my-2 rounded-lg transition-all active:scale-90",
                active
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "fill-primary/20")} />
              <span className="font-display text-[10px] font-bold uppercase tracking-widest mt-1">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Helper that adds page-bottom padding on mobile so content isn't hidden
// behind the bottom nav.
export function BottomNavSpacer() {
  return <div className="h-20 md:hidden" aria-hidden />;
}
