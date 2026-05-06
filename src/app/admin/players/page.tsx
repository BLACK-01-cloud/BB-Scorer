import { createClient } from "@/lib/supabase/server";
import PlayersManager from "./players-manager";
import { PageHeader } from "@/components/chrome/page-header";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Player Database"
        title="Manage Rosters"
        description="The player roster. Team assignments live under Assign Player to Team so they can change per season."
      />
      <PlayersManager initial={data ?? []} loadError={error?.message ?? null} />
    </div>
  );
}
