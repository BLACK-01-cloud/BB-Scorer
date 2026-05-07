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

  const [home, away, roster, statsRes, settingsRes] = await Promise.all([
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
    supabase
      .from("app_settings")
      .select("flash_notification")
      .limit(1)
      .maybeSingle(),
  ]);

  const flashEnabled = settingsRes.data?.flash_notification ?? true;

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Fixed cinematic arena texture
          - Light theme: vivid (full color, higher opacity, slight saturation boost)
          - Dark theme:  muted cinematic (grayscale + low opacity) */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-100 saturate-150 contrast-110 dark:opacity-60 dark:saturate-110 dark:brightness-125 dark:contrast-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/arena-bg.jpg"
          alt=""
          aria-hidden
          className="w-full h-full object-cover"
        />
        {/* Soft top + bottom edge fade so cards stay readable in both themes. */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/30 dark:from-background/60 dark:via-background/15 dark:to-background/60" />
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
            flashNotificationsEnabled={flashEnabled}
          />
        </div>

        <BottomNavSpacer />
      </div>

      <BottomNav />
    </main>
  );
}
