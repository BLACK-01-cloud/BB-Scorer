import {
  Users,
  User as UserIcon,
  CalendarDays,
  Activity,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingLink } from "@/components/loading-link";
import { SeasonFilter } from "./season-filter";
import { formatDateTime, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams?: { season?: string };
}) {
  const supabase = createClient();
  const nowIso = new Date().toISOString();
  const headSelect = { count: "exact" as const, head: true };

  const [
    teamsRes,
    playersRes,
    totalRes,
    liveRes,
    completedRes,
    upcomingRes,
  ] = await Promise.all([
    supabase.from("teams").select("*", headSelect),
    supabase.from("players").select("*", headSelect),
    supabase.from("matches").select("*", headSelect),
    supabase.from("matches").select("*", headSelect).eq("match_status", "live"),
    supabase
      .from("matches")
      .select("*", headSelect)
      .eq("match_status", "completed"),
    supabase
      .from("matches")
      .select("*", headSelect)
      .eq("match_status", "scheduled")
      .gte("match_date", nowIso),
  ]);

  const teams = teamsRes.count ?? 0;
  const players = playersRes.count ?? 0;
  const totalMatches = totalRes.count ?? 0;
  const live = liveRes.count ?? 0;
  const completed = completedRes.count ?? 0;
  const upcoming = upcomingRes.count ?? 0;

  const { data: liveMatch } = await supabase
    .from("matches")
    .select(
      "id, match_date, match_status, home_score, away_score, current_period, time_remaining_seconds, home_team:home_team_id(name, short_name, logo_url), away_team:away_team_id(name, short_name, logo_url)",
    )
    .eq("match_status", "live")
    .order("match_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentMatches } = await supabase
    .from("matches")
    .select(
      "id, match_date, match_status, home_score, away_score, home_team:home_team_id(name, short_name, logo_url), away_team:away_team_id(name, short_name, logo_url)",
    )
    .order("match_date", { ascending: false })
    .limit(8);

  // ---- Season leaders (aggregated across all matches in the chosen season) --
  // The dropdown writes ?season=<id>; we default to the active season.
  const { data: allSeasons } = await supabase
    .from("seasons")
    .select("id, name, is_active, start_date")
    .order("start_date", { ascending: false });

  const seasons = allSeasons ?? [];
  const activeSeason = seasons.find((s) => s.is_active) ?? null;

  const requestedSeasonId = searchParams?.season ?? null;
  const requestedSeason = requestedSeasonId
    ? seasons.find((s) => s.id === requestedSeasonId)
    : null;
  const selectedSeason = requestedSeason ?? activeSeason ?? seasons[0] ?? null;

  type AggLeader = {
    player_id: string;
    player: {
      id: string;
      full_name: string;
      display_name: string | null;
      photo_url: string | null;
    } | null;
    team: { id: string; short_name: string } | null;
    points: number;
    pts_2: number;
    pts_3: number;
  };
  const aggregated: AggLeader[] = [];

  if (selectedSeason) {
    const { data: seasonMatches } = await supabase
      .from("matches")
      .select("id")
      .eq("season_id", selectedSeason.id);
    const matchIds = (seasonMatches ?? []).map((m) => m.id);

    if (matchIds.length > 0) {
      const { data: seasonStats } = await supabase
        .from("match_player_stats")
        .select(
          "player_id, team_id, points, pts_2, pts_3, player:player_id(id, full_name, display_name, photo_url), team:team_id(id, short_name)",
        )
        .in("match_id", matchIds);

      const byPlayer = new Map<string, AggLeader>();
      for (const s of (seasonStats ?? []) as any[]) {
        const cur = byPlayer.get(s.player_id) ?? {
          player_id: s.player_id,
          player: s.player ?? null,
          team: s.team ?? null,
          points: 0,
          pts_2: 0,
          pts_3: 0,
        };
        cur.points += s.points ?? 0;
        cur.pts_2 += s.pts_2 ?? 0;
        cur.pts_3 += s.pts_3 ?? 0;
        byPlayer.set(s.player_id, cur);
      }
      aggregated.push(...byPlayer.values());
    }
  }

  function pickAllTop(metric: (a: AggLeader) => number) {
    let bestVal = 0;
    for (const a of aggregated) {
      const v = metric(a);
      if (v > bestVal) bestVal = v;
    }
    if (bestVal === 0) return null;
    return {
      value: bestVal,
      leaders: aggregated.filter((a) => metric(a) === bestVal),
    };
  }

  const topScorer = pickAllTop((a) => a.points);
  const top2pt = pickAllTop((a) => a.pts_2);
  const top3pt = pickAllTop((a) => a.pts_3);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label-caps text-primary">Admin · Overview</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-1">
            Dashboard
          </h1>
          {activeSeason && (
            <p className="text-sm text-muted-foreground mt-2">
              Active season ·{" "}
              <span className="text-foreground font-medium">
                {activeSeason.name}
              </span>
              {selectedSeason && selectedSeason.id !== activeSeason.id && (
                <span className="ml-2 text-xs">
                  (viewing {selectedSeason.name})
                </span>
              )}
            </p>
          )}
        </div>
      </section>

      {/* Stat tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          label="Teams"
          value={teams}
          Icon={Users}
          href="/admin/teams"
        />
        <StatTile
          label="Players"
          value={players}
          Icon={UserIcon}
          href="/admin/players"
        />
        <StatTile
          label="Matches"
          value={totalMatches}
          Icon={CalendarDays}
          href="/admin/matches"
          sub={`${upcoming} upcoming · ${completed} done`}
        />
        <StatTile
          label="Live now"
          value={live}
          Icon={Activity}
          href="/admin/matches?status=live"
          accent
        />
      </section>

      {/* Live spotlight */}
      <section className="arena-glass rounded-2xl p-4 sm:p-8 relative overflow-hidden">
        <div className="absolute top-5 right-5 sm:top-6 sm:right-6 flex items-center gap-2 px-3 py-1 rounded-full bg-primary text-primary-foreground">
          <span
            className={cn(
              "w-2 h-2 rounded-full bg-primary-foreground",
              liveMatch && "animate-pulse",
            )}
          />
          <span className="label-caps">
            {liveMatch ? "Live now" : "No live match"}
          </span>
        </div>

        <div className="label-caps text-muted-foreground">Spotlight</div>

        {liveMatch ? (
          <LoadingLink
            href={`/live/match/${liveMatch.id}`}
            className="block group"
          >
            <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
              <SpotlightTeamRow
                accent="home"
                logoUrl={(liveMatch as any).home_team?.logo_url ?? null}
                shortName={(liveMatch as any).home_team?.short_name}
                name={(liveMatch as any).home_team?.name}
                score={liveMatch.home_score}
              />
              <div className="text-center px-1 sm:px-3">
                <div className="label-caps text-muted-foreground">
                  Quarter
                </div>
                <div className="font-display text-2xl sm:text-3xl font-bold mt-1">
                  Q{liveMatch.current_period}
                </div>
              </div>
              <SpotlightTeamRow
                accent="away"
                logoUrl={(liveMatch as any).away_team?.logo_url ?? null}
                shortName={(liveMatch as any).away_team?.short_name}
                name={(liveMatch as any).away_team?.name}
                score={liveMatch.away_score}
              />
            </div>
            <div className="mt-8 flex justify-center">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest group-hover:bg-primary/20 transition-colors">
                Open public scoreboard
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </LoadingLink>
        ) : (
          <div className="mt-10 mb-2 text-center text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              No matches are live right now. Open{" "}
              <LoadingLink
                href="/admin/matches"
                className="text-primary underline-offset-2 hover:underline"
              >
                Matches
              </LoadingLink>{" "}
              to start the clock on a fixture.
            </p>
          </div>
        )}
      </section>

      {/* Season leaders */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <span className="label-caps text-primary">Performance</span>
            <h2 className="font-display text-xl sm:text-2xl font-semibold mt-1">
              Season leaders
              {selectedSeason && (
                <span className="ml-2 text-sm text-muted-foreground font-normal">
                  · {selectedSeason.name}
                </span>
              )}
            </h2>
          </div>
          {seasons.length > 0 && (
            <SeasonFilter
              seasons={seasons.map((s) => ({
                id: s.id,
                name: s.name,
                is_active: s.is_active,
              }))}
              selectedId={selectedSeason?.id ?? ""}
            />
          )}
        </div>
        {seasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No seasons yet. Create one under{" "}
            <LoadingLink
              href="/admin/seasons"
              className="text-primary hover:underline"
            >
              Seasons
            </LoadingLink>{" "}
            to track leaders.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <SeasonLeaderCard
              title="Top Scorer"
              unitLabel="pts"
              result={topScorer}
              accent="primary"
            />
            <SeasonLeaderCard
              title="Most 2-Pointers"
              unitLabel="× 2pt"
              result={top2pt}
              accent="blue"
            />
            <SeasonLeaderCard
              title="Most 3-Pointers"
              unitLabel="× 3pt"
              result={top3pt}
              accent="emerald"
            />
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section className="arena-glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-end justify-between mb-5">
          <div>
            <span className="label-caps text-primary">Activity</span>
            <h2 className="font-display text-xl sm:text-2xl font-semibold mt-1">
              Recent matches
            </h2>
          </div>
          <LoadingLink
            href="/admin/matches"
            className="label-caps text-primary hover:text-primary/80"
          >
            View all
          </LoadingLink>
        </div>
        {!recentMatches || recentMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No matches yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="label-caps text-left py-3 text-muted-foreground">
                    Matchup
                  </th>
                  <th className="label-caps text-center py-3 text-muted-foreground hidden sm:table-cell">
                    When
                  </th>
                  <th className="label-caps text-center py-3 text-muted-foreground">
                    Score
                  </th>
                  <th className="label-caps text-right py-3 text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentMatches.map((m, i) => {
                  const home = (m as any).home_team;
                  const away = (m as any).away_team;
                  return (
                    <tr
                      key={m.id}
                      className={cn(
                        "border-b border-border/20",
                        i % 2 === 0 && "bg-foreground/[0.02]",
                      )}
                    >
                      <td className="py-3 pr-2">
                        <LoadingLink
                          href={`/admin/matches/${m.id}`}
                          className="font-medium hover:text-primary"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <RecentTeamLogo
                              logoUrl={home?.logo_url ?? null}
                              shortName={home?.short_name}
                              name={home?.name}
                            />
                            <span className="truncate">{home?.name}</span>
                            <span className="text-muted-foreground text-xs px-1">
                              vs
                            </span>
                            <RecentTeamLogo
                              logoUrl={away?.logo_url ?? null}
                              shortName={away?.short_name}
                              name={away?.name}
                            />
                            <span className="truncate">{away?.name}</span>
                          </span>
                        </LoadingLink>
                      </td>
                      <td className="py-3 px-2 text-center text-xs text-muted-foreground hidden sm:table-cell">
                        {formatDateTime(m.match_date)}
                      </td>
                      <td className="py-3 px-2 text-center font-mono scoreboard-digit text-base font-semibold">
                        {m.home_score} – {m.away_score}
                      </td>
                      <td className="py-3 pl-2 text-right">
                        <StatusPill status={m.match_status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  Icon,
  href,
  sub,
  accent = false,
}: {
  label: string;
  value: number;
  Icon: typeof Users;
  href: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <LoadingLink
      href={href}
      className={cn(
        "rounded-xl p-5 sm:p-6 flex flex-col justify-between transition-colors min-h-[124px]",
        accent
          ? "bg-primary/15 border border-primary/40 hover:bg-primary/20 relative overflow-hidden"
          : "bg-card border border-border/60 hover:border-primary/40",
      )}
    >
      {accent && (
        <span className="absolute top-0 right-0 h-24 w-24 bg-primary/15 rounded-full -mr-10 -mt-10 blur-2xl" />
      )}
      <div className="flex items-start justify-between relative z-10">
        <span
          className={cn(
            "label-caps",
            accent ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        <Icon className={cn("h-5 w-5", "text-primary")} />
      </div>
      <div className="relative z-10">
        <div
          className={cn(
            "font-display font-bold text-3xl sm:text-4xl scoreboard-digit",
            accent ? "text-primary score-glow" : "text-foreground",
          )}
        >
          {String(value).padStart(2, "0")}
        </div>
        {sub && (
          <div className="text-[11px] text-muted-foreground mt-1.5 truncate">
            {sub}
          </div>
        )}
      </div>
    </LoadingLink>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "live") return <Badge variant="live">LIVE</Badge>;
  if (status === "completed") return <Badge variant="success">FINAL</Badge>;
  if (status === "paused") return <Badge variant="warn">PAUSED</Badge>;
  if (status === "cancelled")
    return <Badge variant="destructive">CANCELLED</Badge>;
  return <Badge variant="outline">SCHEDULED</Badge>;
}

type SeasonLeaderEntry = {
  player_id: string;
  player: {
    id: string;
    full_name: string;
    display_name: string | null;
    photo_url: string | null;
  } | null;
  team: { id: string; short_name: string } | null;
};

function SeasonLeaderCard({
  title,
  unitLabel,
  result,
  accent,
}: {
  title: string;
  unitLabel: string;
  result: { value: number; leaders: SeasonLeaderEntry[] } | null;
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
          {result.leaders.map(({ player_id, player, team }) => {
            const name =
              player?.display_name || player?.full_name || "Unknown player";
            return (
              <li key={player_id} className="flex items-center gap-3 min-w-0">
                <SeasonLeaderAvatar
                  photoUrl={player?.photo_url ?? null}
                  name={name}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-sm sm:text-base truncate">
                    {name}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
                    {team?.short_name ?? ""}
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

function SpotlightTeamLogo({
  logoUrl,
  shortName,
  name,
}: {
  logoUrl: string | null;
  shortName?: string | null;
  name?: string | null;
}) {
  // Mobile uses a smaller logo (the spotlight column is narrow); sm+ matches
  // the scorer page TeamHeader (h-36 → h-44).
  const sizeClasses =
    "h-14 w-14 sm:h-36 sm:w-36 md:h-44 md:w-44 aspect-square shrink-0";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name ?? shortName ?? "Team logo"}
        className={cn(
          sizeClasses,
          "rounded-xl object-contain border bg-background/60",
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        sizeClasses,
        "rounded-xl border bg-primary/10 text-primary border-primary/30 grid place-items-center font-display font-bold uppercase tracking-wider",
      )}
    >
      <span className="text-xl sm:text-5xl">
        {shortName?.slice(0, 3) ?? "—"}
      </span>
    </div>
  );
}

function SpotlightTeamRow({
  accent,
  logoUrl,
  shortName,
  name,
  score,
}: {
  accent: "home" | "away";
  logoUrl: string | null;
  shortName?: string | null;
  name?: string | null;
  score: number;
}) {
  return (
    <div
      className={cn(
        "min-w-0 w-full flex gap-2 sm:gap-4",
        // Mobile: stack vertically (logo above name + score) so neither
        // gets crushed in the narrow column.
        // sm+: horizontal row, mirrored across the centerpiece — home logo
        // on the left, away logo on the right.
        "flex-col items-center text-center",
        accent === "home"
          ? "sm:flex-row sm:items-center sm:justify-end sm:text-right"
          : "sm:flex-row-reverse sm:items-center sm:justify-end sm:text-left",
      )}
    >
      <SpotlightTeamLogo
        logoUrl={logoUrl}
        shortName={shortName}
        name={name}
      />
      <div
        className={cn(
          "min-w-0 flex flex-col items-center",
          accent === "home"
            ? "sm:items-end sm:text-right"
            : "sm:items-start sm:text-left",
        )}
      >
        <div className="font-display text-xs sm:text-2xl font-bold uppercase tracking-tight truncate max-w-full">
          {shortName ?? name}
        </div>
        <div className="font-display text-4xl sm:text-8xl font-black text-primary score-glow scoreboard-digit leading-none mt-1 sm:mt-2">
          {score}
        </div>
      </div>
    </div>
  );
}

function RecentTeamLogo({
  logoUrl,
  shortName,
  name,
}: {
  logoUrl: string | null;
  shortName?: string | null;
  name?: string | null;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name ?? shortName ?? "Team logo"}
        className="h-7 w-7 rounded-full object-cover border bg-background/60 shrink-0"
      />
    );
  }
  return (
    <div className="h-7 w-7 rounded-full border bg-primary/10 text-primary border-primary/30 grid place-items-center font-display font-bold uppercase tracking-wider text-[9px] shrink-0">
      {shortName?.slice(0, 3) ?? "—"}
    </div>
  );
}

function SeasonLeaderAvatar({
  photoUrl,
  name,
}: {
  photoUrl: string | null;
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
      {name?.charAt(0)?.toUpperCase() ?? "?"}
    </div>
  );
}
