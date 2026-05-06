// Fast-fail wrapper around fetch used by every Supabase client.
//
// Why: when the Supabase project is paused, the network is offline, or DNS
// is broken, raw fetch hangs for ~30s and ultimately throws
// `[TypeError: fetch failed]` which crashes server components and floods the
// dev terminal. By wrapping fetch with an AbortController + try/catch we:
//
//   1. Time out after a reasonable wait so navigation never stalls.
//   2. Translate the failure into a synthetic 504 response that
//      @supabase/supabase-js handles like any other API error — it returns
//      `{ data: null, error: ... }` to the caller instead of throwing.
//
// When Supabase is healthy the wrapper is a thin pass-through and adds no
// observable overhead.

const DEFAULT_TIMEOUT_MS = 8000;

export function createSafeFetch(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): typeof fetch {
  return async function safeFetch(input, init) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    // Honor any caller-provided AbortSignal alongside our timeout.
    if (init?.signal) {
      if (init.signal.aborted) ac.abort();
      else
        init.signal.addEventListener("abort", () => ac.abort(), { once: true });
    }

    try {
      return await fetch(input as RequestInfo | URL, {
        ...init,
        signal: ac.signal,
      });
    } catch (err) {
      // Keep the dev terminal quiet but still leave one debuggable line.
      if (process.env.NODE_ENV !== "production") {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.href
            : (input as Request).url;
        // eslint-disable-next-line no-console
        console.warn(
          `[supabase] upstream unreachable (${timeoutMs}ms): ${url}`,
        );
      }
      const message =
        err instanceof Error ? err.message : "upstream request failed";
      return new Response(
        JSON.stringify({
          message: `Upstream request failed: ${message}`,
        }),
        {
          status: 504,
          statusText: "Gateway Timeout",
          headers: { "content-type": "application/json" },
        },
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
