"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeOpt = "light" | "dark" | "system";

const options: { value: ThemeOpt; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Close on click outside or Escape.
  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        className={cn("h-9 w-9", className)}
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const current = (theme as ThemeOpt) ?? "system";
  const showing =
    current === "system"
      ? resolvedTheme === "dark"
        ? "dark"
        : "light"
      : current;
  const TriggerIcon =
    current === "system" ? Monitor : showing === "dark" ? Moon : Sun;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9"
      >
        <TriggerIcon className="h-4 w-4" />
        <span className="sr-only">Theme</span>
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-36 rounded-md border bg-popover text-popover-foreground shadow-md z-50 overflow-hidden"
        >
          <ul className="py-1 text-sm">
            {options.map(({ value, label, Icon }) => {
              const selected = current === value;
              return (
                <li key={value}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      setTheme(value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                      "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                      selected && "font-medium",
                    )}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{label}</span>
                    {selected && <Check className="h-4 w-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
