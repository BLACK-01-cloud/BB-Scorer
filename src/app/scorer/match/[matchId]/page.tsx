import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScorerBoard, {
  type RosterRow,
} from "@/components/scorer/scorer-board";
import type {
  Match,
  MatchPlayerStat,
  Team,
  TeamPlayer,
  Player,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function ScorerMatchPage({
  params,
}: {
  params: { matchId: string };
}) {
  const supabase = createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", params.matchId)
    .maybeSingle();

  if (!match) notFound();

  // Lazily ensure match_player_stats exists for the active roster.
  await supabase.rpc("seed_match_roster", { p_match_id: match.id });

  const [homeRes, awayRes, rosterRes, statsRes] = await Promise.all([
    supabase.from("teams").select("*").eq("id", match.home_team_id).single(),
    supabase.from("teams").select("*").eq("id", match.away_team_id).single(),
    supabase
      .from("team_players")
      .select(
        "id, season_id, team_id, player_id, jersey_number, active, player:player_id(id, full_name, display_name, position, photo_url)",
      )
      .eq("season_id", match.season_id)
      .in("team_id", [match.home_team_id, match.away_team_id])
      .eq("active", true),
    supabase.from("match_player_stats").select("*").eq("match_id", match.id),
  ]);

  return (
    <ScorerBoard
      match={match as Match}
      homeTeam={homeRes.data as Team}
      awayTeam={awayRes.data as Team}
      roster={(rosterRes.data ?? []) as unknown as RosterRow[]}
      initialStats={(statsRes.data ?? []) as unknown as MatchPlayerStat[]}
    />
  );
}

// Re-export types here for the page's RosterRow if needed.
export type { TeamPlayer, Player };
