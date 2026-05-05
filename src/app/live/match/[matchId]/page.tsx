import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LiveScoreboard, {
  type RosterRow,
} from "@/components/live/live-scoreboard";
import type { Match, MatchPlayerStat, Team } from "@/lib/types/database";
import { TopAppBar } from "@/components/chrome/top-app-bar";
import { BottomNav, BottomNavSpacer } from "@/components/chrome/bottom-nav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicLivePage({
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

  const [home, away, roster, statsRes] = await Promise.all([
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
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Fixed cinematic arena texture */}
      <div className="fixed inset-0 z-0 opacity-25 grayscale pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/arena-bg.jpg"
          alt=""
          aria-hidden
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="relative z-10">
        <TopAppBar active="live" homeHref="/" />

        <div className="container py-6 md:py-8 px-4 md:px-8">
          <LiveScoreboard
            match={match as Match}
            homeTeam={home.data as Team}
            awayTeam={away.data as Team}
            roster={(roster.data ?? []) as unknown as RosterRow[]}
            initialStats={(statsRes.data ?? []) as unknown as MatchPlayerStat[]}
          />
        </div>

        <BottomNavSpacer />
      </div>

      <BottomNav />
    </main>
  );
}
