import { createClient } from "@/lib/supabase/server";
import MatchesManager from "./matches-manager";
import { PageHeader } from "@/components/chrome/page-header";

export const dynamic = "force-dynamic";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();

  const [seasonsRes, teamsRes] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, is_active, start_date")
      .order("start_date", { ascending: false }),
    supabase
      .from("teams")
      .select("id, name, short_name")
      .order("name", { ascending: true }),
  ]);

  let q = supabase
    .from("matches")
    .select(
      "*, home_team:home_team_id(name), away_team:away_team_id(name), season:season_id(name)",
    )
    .order("match_date", { ascending: false });
  if (searchParams.status) q = q.eq("match_status", searchParams.status);
  const { data, error } = await q;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match Database"
        title="Match Management"
        description="Schedule fixtures, broadcast live games, and review past matches."
      />
      <MatchesManager
        initial={(data ?? []) as any}
        seasons={seasonsRes.data ?? []}
        teams={teamsRes.data ?? []}
        loadError={error?.message ?? null}
        statusFilter={searchParams.status ?? null}
      />
    </div>
  );
}
