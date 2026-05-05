// Constants only — safe to import from client components.
// The server-side `loadBranding()` lives in `./branding.ts` and brings in
// `next/headers` transitively, which can't cross into the client bundle.

export const FALLBACK_SITE_NAME = "BB Score";
export const FALLBACK_ICON = "🏀";

export type Branding = {
  site_name: string;
  logo_url: string | null;
};
