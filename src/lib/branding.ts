import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  FALLBACK_SITE_NAME,
  FALLBACK_ICON,
  type Branding,
} from "./branding-constants";

// Re-export for callers that still import constants from this module.
// Client components should import from `./branding-constants` directly.
export { FALLBACK_SITE_NAME, FALLBACK_ICON };
export type { Branding };

export const loadBranding = cache(async (): Promise<Branding> => {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("site_name, logo_url")
      .limit(1)
      .maybeSingle();
    const site_name =
      data?.site_name && data.site_name.trim().length > 0
        ? data.site_name
        : FALLBACK_SITE_NAME;
    return { site_name, logo_url: data?.logo_url ?? null };
  } catch {
    return { site_name: FALLBACK_SITE_NAME, logo_url: null };
  }
});
