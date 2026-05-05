"use client";

import { useEffect, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useGlobalLoading } from "@/components/loading-provider";

export function AdminNav({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const loading = useGlobalLoading();
  const [isPending, startTransition] = useTransition();

  // While a transition is pending (i.e., a tab click is loading the next
  // page), show the global loader. Stops automatically when pending clears.
  useEffect(() => {
    if (!isPending) return;
    const stop = loading.start();
    return stop;
  }, [isPending, loading]);

  function navigate(href: string, e: React.MouseEvent) {
    // Honor modifier-clicks (open in new tab/window) and middle-click — let
    // the browser handle them naturally.
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      (e as unknown as { button?: number }).button === 1
    ) {
      return;
    }
    e.preventDefault();
    if (href === pathname) return;
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <nav className="container -mb-px overflow-x-auto px-4 md:px-8">
      <ul className="flex gap-1 text-xs font-display font-bold uppercase tracking-[0.18em]">
        {items.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={(e) => navigate(item.href, e)}
                className={cn(
                  "inline-block px-3 py-3 border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-primary",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
