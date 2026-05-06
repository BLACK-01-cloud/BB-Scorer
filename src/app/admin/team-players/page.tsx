import { createClient } from "@/lib/supabase/server";
import TeamPlayersManager from "./team-players-manager";
import { PageHeader } from "@/components/chrome/page-header";

export const dynamic = "force-dynamic";

export default async function TeamPlayersPage() {
  const supabase = createClient();

  const [seasonsRes, teamsRes, playersRes] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, is_active, start_date")
      .order("start_date", { ascending: false }),
    supabase
      .from("teams")
      .select("id, name, short_name, logo_url")
      .order("name", { ascending: true }),
    supabase
      .from("players")
      .select("id, full_name, display_name")
      .order("full_name", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="League · Assign Player to Team"
        title="Assign Player to Team"
        description="Assign players to teams per season. Toggle a row inactive before re-assigning the same player to another team in the same season."
      />
      <TeamPlayersManager
        seasons={seasonsRes.data ?? []}
        teams={teamsRes.data ?? []}
        players={playersRes.data ?? []}
      />
    </div>
  );
}
