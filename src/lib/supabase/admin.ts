import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createSafeFetch } from "./safe-fetch";

// Service-role client. Bypasses RLS — use ONLY in trusted server contexts
// (route handlers, server actions, edge/cron jobs). Never import from a client
// component. Importing "server-only" makes this module fail the bundle if it
// ever lands in a client chunk.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "Missing Supabase admin env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.",
    );
  }
  return createSupabaseClient<Database>(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: createSafeFetch() },
  });
}
