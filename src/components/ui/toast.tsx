"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "default" | "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  leaving?: boolean;
}

interface ToastContextValue {
  push: (message: string, kind?: ToastKind) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 3500;
const LEAVE_DURATION = 240;

const KIND_STYLES: Record<
  ToastKind,
  {
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    iconWrap: string;
    iconColor: string;
    progress: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    accent: "before:bg-gradient-to-b before:from-emerald-400 before:to-emerald-600",
    iconWrap: "bg-emerald-500/15 ring-1 ring-emerald-500/30",
    iconColor: "text-emerald-500",
    progress: "bg-gradient-to-r from-emerald-400 to-emerald-600",
  },
  error: {
    icon: XCircle,
    accent: "before:bg-gradient-to-b before:from-red-400 before:to-red-600",
    iconWrap: "bg-red-500/15 ring-1 ring-red-500/30",
    iconColor: "text-red-500",
    progress: "bg-gradient-to-r from-red-400 to-red-600",
  },
  info: {
    icon: Info,
    accent: "before:bg-gradient-to-b before:from-sky-400 before:to-sky-600",
    iconWrap: "bg-sky-500/15 ring-1 ring-sky-500/30",
    iconColor: "text-sky-500",
    progress: "bg-gradient-to-r from-sky-400 to-sky-600",
  },
  warning: {
    icon: AlertTriangle,
    accent: "before:bg-gradient-to-b before:from-amber-400 before:to-amber-600",
    iconWrap: "bg-amber-500/15 ring-1 ring-amber-500/30",
    iconColor: "text-amber-500",
    progress: "bg-gradient-to-r from-amber-400 to-amber-600",
  },
  default: {
    icon: Info,
    accent: "before:bg-gradient-to-b before:from-primary/70 before:to-primary",
    iconWrap: "bg-primary/15 ring-1 ring-primary/30",
    iconColor: "text-primary",
    progress: "bg-gradient-to-r from-primary/70 to-primary",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, LEAVE_DURATION);
  }, []);

  const push = React.useCallback(
    (message: string, kind: ToastKind = "default") => {
      const id = ++counter.current;
      setItems((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => dismiss(id), TOAST_DURATION);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(calc(100vw-2rem),22rem)] flex-col gap-2.5">
        {items.map((t) => {
          const cfg = KIND_STYLES[t.kind];
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              role="status"
              aria-live="polite"
              className={cn(
                "pointer-events-auto group relative overflow-hidden rounded-xl border border-border/50 bg-card/95 shadow-xl shadow-black/10 backdrop-blur-md",
                "before:absolute before:left-0 before:top-0 before:h-full before:w-1.5 before:content-['']",
                cfg.accent,
                t.leaving ? "toast-leave" : "toast-enter",
              )}
            >
              <div className="flex items-start gap-3 py-3 pl-5 pr-3">
                <div
                  className={cn(
                    "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
                    cfg.iconWrap,
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px]", cfg.iconColor)} />
                </div>
                <div className="min-w-0 flex-1 self-center">
                  <p className="text-sm leading-snug text-foreground break-words">
                    {t.message}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(t.id)}
                  className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/40">
                <div
                  className={cn("toast-progress-bar h-full", cfg.progress)}
                  style={{ animationDuration: `${TOAST_DURATION}ms` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
