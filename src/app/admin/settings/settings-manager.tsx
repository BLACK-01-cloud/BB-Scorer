"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AppSettings } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateBrandingAction } from "./actions";
import { FALLBACK_ICON, FALLBACK_SITE_NAME } from "@/lib/branding-constants";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

export default function SettingsManager({
  initial,
  loadError,
}: {
  initial: AppSettings | null;
  loadError: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [siteName, setSiteName] = useState(
    initial?.site_name ?? FALLBACK_SITE_NAME,
  );
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(
    initial?.logo_url ?? null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(
    initial?.flash_notification ?? true,
  );

  function onPickFile(file: File | null) {
    if (!file) {
      setPickedFile(null);
      setPreviewUrl(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.push("Logo must be 2 MB or smaller.", "error");
      return;
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      toast.push("Logo must be PNG, JPEG, WebP, or SVG.", "error");
      return;
    }
    setPickedFile(file);
    setClearLogo(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function onClear() {
    setPickedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setClearLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onSave() {
    const fd = new FormData();
    fd.set("site_name", siteName);
    if (clearLogo) fd.set("clear_logo", "1");
    if (pickedFile) fd.set("logo", pickedFile);
    fd.set("flash_notification", flashEnabled ? "1" : "0");

    startTransition(async () => {
      const res = await updateBrandingAction(fd);
      if (!res.ok) {
        toast.push(res.error, "error");
        return;
      }
      toast.push("Branding updated.", "success");
      setCurrentLogoUrl(res.logo_url ?? null);
      setPickedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setClearLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  const previewLogoSrc =
    previewUrl ?? (clearLogo ? null : currentLogoUrl ?? null);

  return (
    <div className="space-y-4">
      {loadError && (
        <p className="text-sm text-destructive">{loadError}</p>
      )}

      <p className="text-xs text-muted-foreground">
        Note: light/dark theme is a per-user, per-device preference (stored
        in <code>localStorage</code>) — controlled via the theme toggle in
        the navbar. Branding (logo + site name) is shared across all
        viewers.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="site_name">Site name</Label>
              <Input
                id="site_name"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                maxLength={80}
                placeholder={FALLBACK_SITE_NAME}
              />
              <p className="text-xs text-muted-foreground">
                Falls back to &quot;{FALLBACK_SITE_NAME}&quot; if blank.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo">Logo</Label>
              <Input
                id="logo"
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_MIMES.join(",")}
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                PNG, JPEG, WebP, or SVG. Max 2 MB.
              </p>
              {(currentLogoUrl || pickedFile) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                  disabled={pending}
                >
                  {pickedFile ? "Cancel selection" : "Remove current logo"}
                </Button>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <Label className="block">Flash notification</Label>
              <button
                type="button"
                role="switch"
                aria-checked={flashEnabled}
                onClick={() => setFlashEnabled((v) => !v)}
                disabled={pending}
                className={
                  "group flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition " +
                  (flashEnabled
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 bg-muted/30")
                }
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {flashEnabled ? "Enabled" : "Disabled"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Show the animated player score popup on the live page when
                    a player makes a basket.
                  </p>
                </div>
                <span
                  className={
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition " +
                    (flashEnabled ? "bg-primary" : "bg-muted-foreground/40")
                  }
                  aria-hidden
                >
                  <span
                    className={
                      "inline-block h-5 w-5 transform rounded-full bg-background shadow ring-1 ring-border/60 transition " +
                      (flashEnabled ? "translate-x-5" : "translate-x-0.5")
                    }
                  />
                </span>
              </button>
            </div>

            <div className="pt-2">
              <Button onClick={onSave} disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm font-medium">Preview</p>
            <div className="rounded-md border bg-background">
              <div className="flex h-14 items-center gap-2 px-4">
                {previewLogoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewLogoSrc}
                    alt="Logo preview"
                    className="h-7 w-7 rounded object-contain"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold">
                    {FALLBACK_ICON}
                  </div>
                )}
                <span className="font-bold text-sm">
                  {siteName.trim() || FALLBACK_SITE_NAME}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This is how the navbar appears across the site.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
