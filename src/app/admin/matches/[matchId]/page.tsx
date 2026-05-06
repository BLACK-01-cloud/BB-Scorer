import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/chrome/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LoadingLink } from "@/components/loading-link";
import { cn, formatDateTime } from "@/lib/utils";
import type {
  Match,
  MatchPlayerStat,
  MatchStatus,
  Player,
  Team,
  TeamPlayer,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

type RosterRow = TeamPlayer & {
  player: Pick<
    Player,
    "id" | "full_name" | "display_name" | "photo_url" | "position"
  > | null;
};

export default async function MatchStatsPage({
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

  const [homeRes, awayRes, rosterRes, statsRes] = await Promise.all([
    supabase.from("teams").select("*").eq("id", match.home_team_id).single(),
    supabase.from("teams").select("*").eq("id", match.away_team_id).single(),
    supabase
      .from("team_players")
      .select(
        "id, season_id, team_id, player_id, jersey_number, active, created_at, player:player_id(id, full_name, display_name, photo_url, position)",
      )
      .eq("season_id", match.season_id)
      .in("team_id", [match.home_team_id, match.away_team_id])
      .eq("active", true),
    supabase.from("match_player_stats").select("*").eq("match_id", match.id),
  ]);

  const home = homeRes.data as Team;
  const away = awayRes.data as Team;
  const roster = (rosterRes.data ?? []) as unknown as RosterRow[];
  const stats = (statsRes.data ?? []) as MatchPlayerStat[];

  const homeRoster = roster.filter((r) => r.team_id === home.id);
  const awayRoster = roster.filter((r) => r.team_id === away.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match · Stats Preview"
        title={`${home.name} vs ${away.name}`}
        description={`${formatDateTime(match.match_date)}${
          match.venue ? ` · ${match.venue}` : ""
        }`}
        actions={
          <div className="flex items-center gap-2">
            <LoadingLink
              href="/admin/matches"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </LoadingLink>
            <LoadingLink
              href={`/scorer/match/${match.id}`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Score
            </LoadingLink>
            <Link
              href={`/live/match/${match.id}`}
              target="_blank"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Public
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Link>
          </div>
        }
      />

      <ScoreBanner match={match as Match} home={home} away={away} />

      <MatchLeaders
        roster={roster}
        stats={stats}
        home={home}
        away={away}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <TeamStatsTable
          team={home}
          accent="home"
          roster={homeRoster}
          stats={stats}
        />
        <TeamStatsTable
          team={away}
          accent="away"
          roster={awayRoster}
          stats={stats}
        />
      </div>
    </div>
  );
}

function ScoreBanner({
  match,
  home,
  away,
}: {
  match: Match;
  home: Team;
  away: Team;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-3 gap-2 p-5 sm:p-6">
        <div className="text-center">
          <div className="font-display text-base sm:text-xl font-bold uppercase tracking-tight truncate">
            {home.name}
          </div>
          <div className="font-mono font-black text-5xl sm:text-7xl text-primary scoreboard-digit mt-1">
            {match.home_score}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
            Team Fouls{" "}
            <span className="font-mono font-bold text-foreground">
              {match.home_team_fouls}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center">
          <div className="label-caps text-muted-foreground">
            Quarter {match.current_period}
          </div>
          <div className="mt-2">
            <StatusPill status={match.match_status} />
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2">
            {match.match_type.replace("_", " ")}
          </div>
        </div>

        <div className="text-center">
          <div className="font-display text-base sm:text-xl font-bold uppercase tracking-tight truncate">
            {away.name}
          </div>
          <div className="font-mono font-black text-5xl sm:text-7xl text-primary scoreboard-digit mt-1">
            {match.away_score}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
            Team Fouls{" "}
            <span className="font-mono font-bold text-foreground">
              {match.away_team_fouls}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TeamStatsTable({
  team,
  accent,
  roster,
  stats,
}: {
  team: Team;
  accent: "home" | "away";
  roster: RosterRow[];
  stats: MatchPlayerStat[];
}) {
  const accentBar = accent === "home" ? "bg-primary" : "bg-blue-500";
  const accentChip =
    accent === "home"
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-blue-500/30 bg-blue-500/10 text-blue-500";

  const statByPlayer = new Map<string, MatchPlayerStat>();
  for (const s of stats) statByPlayer.set(s.player_id, s);

  // Include rostered players first, then any ad-hoc players that have stats
  // but aren't on the active roster (rare but possible).
  const seen = new Set<string>();
  const rows: { row: RosterRow | null; stat: MatchPlayerStat | undefined }[] =
    roster.map((r) => {
      seen.add(r.player_id);
      return { row: r, stat: statByPlayer.get(r.player_id) };
    });
  for (const s of stats) {
    if (s.team_id === team.id && !seen.has(s.player_id)) {
      rows.push({ row: null, stat: s });
    }
  }

  // Sort by total points desc.
  rows.sort((a, b) => (b.stat?.points ?? 0) - (a.stat?.points ?? 0));

  const totals = stats
    .filter((s) => s.team_id === team.id)
    .reduce(
      (acc, s) => {
        acc.pts_1 += s.pts_1 ?? 0;
        acc.pts_2 += s.pts_2 ?? 0;
        acc.pts_3 += s.pts_3 ?? 0;
        acc.points += s.points ?? 0;
        acc.fouls += s.fouls ?? 0;
        return acc;
      },
      { pts_1: 0, pts_2: 0, pts_3: 0, points: 0, fouls: 0 },
    );

  return (
    <Card className="overflow-hidden">
      <div className={cn("h-1 w-full", accentBar)} />
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo team={team} accentChipClass={accentChip} />
            <span className="truncate">{team.name}</span>
          </div>
          <Badge variant="outline" className="font-mono">
            {rows.length} players
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No roster or stats recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="label-caps text-left py-2 px-4 text-muted-foreground">
                    Player
                  </th>
                  <th className="label-caps text-center py-2 px-2 text-muted-foreground">
                    1pt
                  </th>
                  <th className="label-caps text-center py-2 px-2 text-muted-foreground">
                    2pt
                  </th>
                  <th className="label-caps text-center py-2 px-2 text-muted-foreground">
                    3pt
                  </th>
                  <th className="label-caps text-center py-2 px-2 text-muted-foreground">
                    Pts
                  </th>
                  <th className="label-caps text-center py-2 px-2 text-muted-foreground">
                    Fouls
                  </th>
                  <th className="label-caps text-right py-2 px-4 text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, stat }, i) => {
                  const name =
                    row?.player?.display_name ||
                    row?.player?.full_name ||
                    "—";
                  return (
                    <tr
                      key={(row?.id ?? stat?.id ?? String(i)) as string}
                      className={cn(
                        "border-b border-border/20",
                        i % 2 === 0 && "bg-foreground/[0.02]",
                      )}
                    >
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar
                            photoUrl={row?.player?.photo_url ?? null}
                            jersey={row?.jersey_number ?? null}
                            name={name}
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{name}</div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-mono">
                              {row?.jersey_number
                                ? `#${row.jersey_number}`
                                : ""}
                              {row?.player?.position
                                ? `${row?.jersey_number ? " · " : ""}${
                                    row.player.position
                                  }`
                                : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center font-mono">
                        {stat?.pts_1 ?? 0}
                      </td>
                      <td className="py-2 px-2 text-center font-mono">
                        {stat?.pts_2 ?? 0}
                      </td>
                      <td className="py-2 px-2 text-center font-mono">
                        {stat?.pts_3 ?? 0}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-bold">
                        {stat?.points ?? 0}
                      </td>
                      <td className="py-2 px-2 text-center font-mono">
                        {stat?.fouls ?? 0}
                      </td>
                      <td className="py-2 px-4 text-right">
                        {stat?.is_active ? (
                          <Badge variant="success">On court</Badge>
                        ) : (
                          <Badge variant="outline">Bench</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-bold bg-muted/40">
                  <td className="py-2 px-4 text-right uppercase text-xs tracking-wider text-muted-foreground">
                    Totals
                  </td>
                  <td className="py-2 px-2 text-center font-mono">
                    {totals.pts_1}
                  </td>
                  <td className="py-2 px-2 text-center font-mono">
                    {totals.pts_2}
                  </td>
                  <td className="py-2 px-2 text-center font-mono">
                    {totals.pts_3}
                  </td>
                  <td className="py-2 px-2 text-center font-mono">
                    {totals.points}
                  </td>
                  <td className="py-2 px-2 text-center font-mono">
                    {totals.fouls}
                  </td>
                  <td className="py-2 px-4" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamLogo({
  team,
  accentChipClass,
}: {
  team: Team;
  accentChipClass: string;
}) {
  if (team.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logo_url}
        alt={team.name}
        className="h-8 w-8 rounded-md border object-contain bg-background/60 shrink-0"
      />
    );
  }
  return (
    <div
      className={cn(
        "h-8 w-8 rounded-md border grid place-items-center font-display font-bold uppercase tracking-wider text-[10px] shrink-0",
        accentChipClass,
      )}
    >
      {team.short_name?.slice(0, 3) ?? "—"}
    </div>
  );
}

function PlayerAvatar({
  photoUrl,
  jersey,
  name,
}: {
  photoUrl: string | null;
  jersey: string | null;
  name: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="h-8 w-8 rounded-full object-cover border shrink-0"
      />
    );
  }
  return (
    <div className="h-8 w-8 rounded-full bg-primary/15 text-primary grid place-items-center font-mono font-bold text-xs shrink-0">
      {jersey ?? name?.charAt(0)?.toUpperCase() ?? "?"}
    </div>
  );
}

function StatusPill({ status }: { status: MatchStatus }) {
  if (status === "live") return <Badge variant="live">LIVE</Badge>;
  if (status === "completed") return <Badge variant="success">FINAL</Badge>;
  if (status === "paused") return <Badge variant="warn">PAUSED</Badge>;
  if (status === "cancelled")
    return <Badge variant="destructive">CANCELLED</Badge>;
  return <Badge variant="outline">SCHEDULED</Badge>;
}

function MatchLeaders({
  roster,
  stats,
  home,
  away,
}: {
  roster: RosterRow[];
  stats: MatchPlayerStat[];
  home: Team;
  away: Team;
}) {
  // Index roster by player_id so we can resolve a name/jersey/photo per stat row.
  const rosterByPlayer = new Map<string, RosterRow>();
  for (const r of roster) rosterByPlayer.set(r.player_id, r);

  // Returns every player tied at the highest value for the given metric.
  // null when nobody has scored in that bucket yet.
  function pickAllTop(metric: (s: MatchPlayerStat) => number) {
    let bestVal = 0;
    for (const s of stats) {
      const v = metric(s);
      if (v > bestVal) bestVal = v;
    }
    if (bestVal === 0) return null;
    const tied = stats
      .filter((s) => metric(s) === bestVal)
      .map((s) => ({
        stat: s,
        row: rosterByPlayer.get(s.player_id) ?? null,
        team:
          s.team_id === home.id
            ? home
            : s.team_id === away.id
            ? away
            : null,
      }));
    return { value: bestVal, leaders: tied };
  }

  const topScorer = pickAllTop((s) => s.points ?? 0);
  const top2pt = pickAllTop((s) => s.pts_2 ?? 0);
  const top3pt = pickAllTop((s) => s.pts_3 ?? 0);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <LeaderCard
        title="Top Scorer"
        unitLabel="pts"
        result={topScorer}
        accent="primary"
      />
      <LeaderCard
        title="Most 2-Pointers"
        unitLabel="× 2pt"
        result={top2pt}
        accent="blue"
      />
      <LeaderCard
        title="Most 3-Pointers"
        unitLabel="× 3pt"
        result={top3pt}
        accent="emerald"
      />
    </div>
  );
}

function LeaderCard({
  title,
  unitLabel,
  result,
  accent,
}: {
  title: string;
  unitLabel: string;
  result: {
    value: number;
    leaders: {
      stat: MatchPlayerStat;
      row: RosterRow | null;
      team: Team | null;
    }[];
  } | null;
  accent: "primary" | "blue" | "emerald";
}) {
  const accentText =
    accent === "primary"
      ? "text-primary"
      : accent === "blue"
      ? "text-blue-500"
      : "text-emerald-500";
  const accentBar =
    accent === "primary"
      ? "bg-primary"
      : accent === "blue"
      ? "bg-blue-500"
      : "bg-emerald-500";

  if (!result) {
    return (
      <Card className="overflow-hidden">
        <div className={cn("h-1 w-full", accentBar)} />
        <CardContent className="p-5">
          <div className="label-caps text-muted-foreground">{title}</div>
          <div className="mt-3 text-sm text-muted-foreground italic">
            No data yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const tieCount = result.leaders.length;

  return (
    <Card className="overflow-hidden">
      <div className={cn("h-1 w-full", accentBar)} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="label-caps text-muted-foreground">{title}</div>
          <div className="text-right shrink-0">
            <div
              className={cn(
                "font-mono font-black text-3xl sm:text-4xl scoreboard-digit leading-none",
                accentText,
              )}
            >
              {result.value}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
              {unitLabel}
            </div>
          </div>
        </div>

        {tieCount > 1 && (
          <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            {tieCount} players tied
          </div>
        )}

        <ul className="mt-3 space-y-2">
          {result.leaders.map(({ stat, row, team }) => {
            const name =
              row?.player?.display_name ||
              row?.player?.full_name ||
              "Unknown player";
            const jersey = row?.jersey_number ?? null;
            return (
              <li
                key={stat.id}
                className="flex items-center gap-3 min-w-0"
              >
                <PlayerAvatarBig
                  photoUrl={row?.player?.photo_url ?? null}
                  jersey={jersey}
                  name={name}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-sm sm:text-base truncate">
                    {name}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
                    {jersey ? `#${jersey}` : ""}
                    {team ? `${jersey ? " · " : ""}${team.short_name}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function PlayerAvatarBig({
  photoUrl,
  jersey,
  name,
}: {
  photoUrl: string | null;
  jersey: string | null;
  name: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="h-12 w-12 rounded-full object-cover border shrink-0"
      />
    );
  }
  return (
    <div className="h-12 w-12 rounded-full bg-primary/15 text-primary grid place-items-center font-mono font-bold text-base shrink-0">
      {jersey ?? name?.charAt(0)?.toUpperCase() ?? "?"}
    </div>
  );
}
