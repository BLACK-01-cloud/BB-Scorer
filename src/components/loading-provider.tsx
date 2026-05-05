"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Operations faster than this never flash the overlay.
const SHOW_DELAY_MS = 200;

type Ctx = {
  /** Begin a tracked async operation. Returns a stop() function. */
  start: (message?: string) => () => void;
  /** Convenience: wraps an async function in start/stop. */
  run: <T>(fn: () => Promise<T>, message?: string) => Promise<T>;
};

const LoadingContext = createContext<Ctx | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  // Number of in-flight tracked operations. Overlay is visible when > 0
  // AND it's been pending longer than SHOW_DELAY_MS.
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manage the debounced visibility based on pending count.
  useEffect(() => {
    if (pending > 0) {
      if (visible) return;
      if (showTimerRef.current) return;
      showTimerRef.current = setTimeout(() => {
        setVisible(true);
        showTimerRef.current = null;
      }, SHOW_DELAY_MS);
    } else {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (visible) setVisible(false);
      if (message) setMessage(null);
    }
  }, [pending, visible, message]);

  const start = useCallback((msg?: string) => {
    if (msg) setMessage(msg);
    setPending((n) => n + 1);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      setPending((n) => Math.max(0, n - 1));
    };
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, msg?: string): Promise<T> => {
      const stop = start(msg);
      try {
        return await fn();
      } finally {
        stop();
      }
    },
    [start],
  );

  return (
    <LoadingContext.Provider value={{ start, run }}>
      {children}
      {visible && <CenteredOverlay message={message} />}
    </LoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) {
    // Soft fallback so this hook never crashes the tree if used outside the
    // provider (e.g. during a future refactor) — operations just don't show
    // the overlay.
    return {
      start: () => () => {},
      run: <T,>(fn: () => Promise<T>) => fn(),
    } as Ctx;
  }
  return ctx;
}

function CenteredOverlay({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message ?? "Loading"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-transparent pointer-events-none"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
    </div>
  );
}
