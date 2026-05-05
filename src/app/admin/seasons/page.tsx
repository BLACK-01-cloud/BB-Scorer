import { createClient } from "@/lib/supabase/server";
import SeasonsManager from "./seasons-manager";
import { PageHeader } from "@/components/chrome/page-header";

export const dynamic = "force-dynamic";

export default async function SeasonsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .order("start_date", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="League"
        title="Seasons"
        description="Manage league seasons and mark which one is currently active."
      />
      <SeasonsManager initial={data ?? []} loadError={error?.message ?? null} />
    </div>
  );
}
