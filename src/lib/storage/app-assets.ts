"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export const APP_ASSETS_BUCKET = "app-assets";

export const APP_ASSETS_MAX_BYTES = 2 * 1024 * 1024;

export const APP_ASSETS_ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function validateImageFile(file: File): string | null {
  if (file.size > APP_ASSETS_MAX_BYTES) {
    return "Image must be 2 MB or smaller.";
  }
  if (!APP_ASSETS_ALLOWED_MIMES.includes(file.type as (typeof APP_ASSETS_ALLOWED_MIMES)[number])) {
    return "Image must be PNG, JPEG, WebP, or SVG.";
  }
  return null;
}

export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${APP_ASSETS_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
}

export async function uploadAppAsset(
  supabase: SupabaseClient,
  folder: string,
  file: File,
): Promise<string> {
  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(APP_ASSETS_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(APP_ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function removeAppAssetByUrl(
  supabase: SupabaseClient,
  url: string | null | undefined,
): Promise<void> {
  const path = pathFromPublicUrl(url);
  if (!path) return;
  // Best-effort: ignore failures.
  await supabase.storage.from(APP_ASSETS_BUCKET).remove([path]);
}
