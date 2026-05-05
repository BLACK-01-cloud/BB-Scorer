import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import type { AppSettings } from "@/lib/types/database";
import SettingsManager from "./settings-manager";
import { PageHeader } from "@/components/chrome/page-header";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin("/admin/settings");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Settings"
        title="Branding"
        description="Configure platform branding and preview design tokens."
      />
      <SettingsManager
        initial={(data ?? null) as AppSettings | null}
        loadError={error?.message ?? null}
      />
    </div>
  );
}
