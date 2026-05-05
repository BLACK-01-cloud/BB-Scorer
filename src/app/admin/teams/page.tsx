import { createClient } from "@/lib/supabase/server";
import TeamsManager from "./teams-manager";
import { PageHeader } from "@/components/chrome/page-header";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clubs"
        title="Teams"
        description="Manage clubs that compete in your league."
      />
      <TeamsManager initial={data ?? []} loadError={error?.message ?? null} />
    </div>
  );
}
