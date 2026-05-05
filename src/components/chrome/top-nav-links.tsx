"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavSection } from "./top-app-bar";

const sections: { key: NavSection; label: string; href: string }[] = [
  { key: "live", label: "Live", href: "/" },
  { key: "scorer", label: "Scorer", href: "/scorer/matches" },
  { key: "admin", label: "Admin", href: "/admin" },
];

export function TopNavLinks({ active }: { active: NavSection }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex gap-5 font-display text-sm font-bold uppercase tracking-[0.18em]">
      {sections.map((s) => {
        const isActive =
          s.key === active ||
          (s.key === "live" && pathname === "/") ||
          (s.key === "scorer" && pathname.startsWith("/scorer")) ||
          (s.key === "admin" && pathname.startsWith("/admin"));
        return (
          <Link
            key={s.key}
            href={s.href}
            className={cn(
              "pb-0.5 transition-colors",
              isActive
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-primary",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
