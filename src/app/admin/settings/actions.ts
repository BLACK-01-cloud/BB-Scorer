"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export type ActionResult =
  | { ok: true; logo_url?: string | null }
  | { ok: false; error: string };

function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/app-assets/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
}

export async function updateBrandingAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin("/admin/settings");

  const siteName = String(formData.get("site_name") ?? "").trim();
  const clearLogo = formData.get("clear_logo") === "1";
  const logoFile = formData.get("logo") as File | null;

  if (siteName.length === 0 || siteName.length > 80) {
    return {
      ok: false,
      error: "Site name is required (max 80 characters).",
    };
  }

  const admin = createAdminClient();

  // Load current row (so we know the existing logo path for cleanup).
  const { data: current, error: loadError } = await admin
    .from("app_settings")
    .select("id, logo_url")
    .limit(1)
    .maybeSingle();
  if (loadError) return { ok: false, error: loadError.message };

  let nextLogoUrl: string | null | undefined = undefined; // undefined = leave alone
  let oldPathToRemove: string | null = null;

  if (clearLogo) {
    nextLogoUrl = null;
    oldPathToRemove = pathFromPublicUrl(current?.logo_url);
  } else if (logoFile && logoFile.size > 0) {
    if (logoFile.size > MAX_BYTES) {
      return { ok: false, error: "Logo must be 2 MB or smaller." };
    }
    if (!ALLOWED_MIMES.has(logoFile.type)) {
      return {
        ok: false,
        error: "Logo must be PNG, JPEG, WebP, or SVG.",
      };
    }
    const ext = EXT_BY_MIME[logoFile.type] ?? "bin";
    const path = `branding/logo-${Date.now()}.${ext}`;
    const buf = Buffer.from(await logoFile.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("app-assets")
      .upload(path, buf, {
        contentType: logoFile.type,
        upsert: false,
        cacheControl: "3600",
      });
    if (uploadError) {
      return { ok: false, error: `Upload failed: ${uploadError.message}` };
    }

    const { data: publicData } = admin.storage
      .from("app-assets")
      .getPublicUrl(path);
    nextLogoUrl = publicData.publicUrl;
    oldPathToRemove = pathFromPublicUrl(current?.logo_url);
  }

  const update: { site_name: string; logo_url?: string | null } = {
    site_name: siteName,
  };
  if (nextLogoUrl !== undefined) update.logo_url = nextLogoUrl;

  if (current) {
    const { error } = await admin
      .from("app_settings")
      .update(update)
      .eq("id", current.id);
    if (error) return { ok: false, error: error.message };
  } else {
    // Migration seeds the row, but cover the case where it was deleted.
    const { error } = await admin.from("app_settings").insert({
      singleton: true,
      ...update,
    });
    if (error) return { ok: false, error: error.message };
  }

  // Best-effort cleanup of the previous logo. Don't fail the whole action if
  // delete fails — the row update already succeeded.
  if (oldPathToRemove && oldPathToRemove !== pathFromPublicUrl(nextLogoUrl ?? null)) {
    await admin.storage.from("app-assets").remove([oldPathToRemove]);
  }

  revalidatePath("/", "layout");
  return { ok: true, logo_url: nextLogoUrl ?? current?.logo_url ?? null };
}
