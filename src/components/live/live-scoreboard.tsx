"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Match,
  MatchPlayerStat,
  MatchStatus,
  Player,
  Team,
  TeamPlayer,
} from "@/lib/types/database";
import { formatClock } from "@/lib/utils";

export type RosterRow = TeamPlayer & {
  player: Pick<
    Player,
    "id" | "full_name" | "display_name" | "photo_url" | "position"
  > | null;
};

export default function LiveScoreboard({
  match: initialMatch,
  homeTeam,
  awayTeam,
  roster,
  initialStats,
}: {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  roster: RosterRow[];
  initialStats: MatchPlayerStat[];
}) {
  const supabase = createClient();
  const [match, setMatch] = useState<Match>(initialMatch);
  const [stats, setStats] = useState<MatchPlayerStat[]>(initialStats);
  const [connected, setConnected] = useState(false);

  const localTimerRef = useRef(initialMatch.time_remaining_seconds);
  const localShotRef = useRef(initialMatch.shot_clock_seconds);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!match.timer_running) {
      localTimerRef.current = match.time_remaining_seconds;
    }
    if (!match.shot_clock_running) {
      localShotRef.current = match.shot_clock_seconds;
    }
  }, [
    match.time_remaining_seconds,
    match.shot_clock_seconds,
    match.timer_running,
    match.shot_clock_running,
  ]);

  useEffect(() => {
    if (!match.timer_running && !match.shot_clock_running) return;
    const handle = window.setInterval(() => {
      let changed = false;
      if (match.timer_running && localTimerRef.current > 0) {
        localTimerRef.current -= 1;
        changed = true;
      }
      if (match.shot_clock_running && localShotRef.current > 0) {
        localShotRef.current -= 1;
        changed = true;
      }
      if (changed) setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(handle);
  }, [match.timer_running, match.shot_clock_running]);

  useEffect(() => {
    const channel = supabase
      .channel(`live-match-${match.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `id=eq.${match.id}`,
        },
        (payload) => {
          const next = payload.new as Match;
          if (next?.id) setMatch(next);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_player_stats",
          filter: `match_id=eq.${match.id}`,
        },
        (payload) => {
          const row = payload.new as MatchPlayerStat;
          if (!row?.id) return;
          setStats((prev) => {
            const idx = prev.findIndex((x) => x.id === row.id);
            if (idx === -1) return [...prev, row];
            const copy = prev.slice();
            copy[idx] = row;
            return copy;
          });
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, match.id]);

  const homeRoster = roster.filter((r) => r.team_id === homeTeam.id);
  const awayRoster = roster.filter((r) => r.team_id === awayTeam.id);

  const statsByPlayer = useMemo(() => {
    const m = new Map<string, MatchPlayerStat>();
    for (const s of stats) m.set(s.player_id, s);
    return m;
  }, [stats]);

  const displayTimer = match.timer_running
    ? localTimerRef.current
    : match.time_remaining_seconds;
  const displayShot = match.shot_clock_running
    ? localShotRef.current
    : match.shot_clock_seconds;

  // On-court players from both teams (for the unified performance table)
  const onCourtRows = roster
    .map((r) => ({
      roster: r,
      stat: statsByPlayer.get(r.player_id),
      teamShort:
        r.team_id === homeTeam.id ? homeTeam.short_name : awayTeam.short_name,
      isHome: r.team_id === homeTeam.id,
    }))
    .filter((r) => r.stat?.is_active);

  // Win-probability bar based on score differential (no event log; this is a
  // simple lead-share visualization, not a model output).
  const totalScore = match.home_score + match.away_score;
  const homePct =
    totalScore > 0 ? Math.round((match.home_score / totalScore) * 100) : 50;
  const awayPct = 100 - homePct;

  return (
    <div className="space-y-6 mt-2">
      {/* Top row: scoreboard + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
        {/* Hero scoreboard */}
        <section className="arena-glass rounded-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* LIVE NOW pill */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 px-3 py-1 bg-primary rounded-full">
            <span
              className={`w-2 h-2 rounded-full bg-primary-foreground ${
                connected ? "animate-pulse" : ""
              }`}
            />
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.15em] text-primary-foreground">
              {connected ? "Live Now" : "Connecting"}
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8 py-6 sm:py-8">
            {/* Home team */}
            <div className="flex flex-col items-center md:items-end text-center md:text-right">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground uppercase tracking-tight">
                {homeTeam.name}
              </h2>
              <div className="font-display text-[64px] sm:text-[72px] font-bold leading-none text-primary score-glow scoreboard-digit mt-2">
                {match.home_score}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5 text-[11px] uppercase tracking-[0.12em] font-bold">
                <span className="text-muted-foreground">Fouls:</span>
                <span className="text-primary">{match.home_team_fouls}</span>
              </div>
            </div>

            {/* Centerpiece */}
            <div className="flex flex-col items-center bg-muted/70 px-6 sm:px-8 py-5 sm:py-6 rounded-2xl border border-border/60 min-w-[14rem]">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.3em] text-primary/90 mb-2">
                Quarter {match.current_period}
              </span>
              <div className="font-display font-bold text-foreground text-5xl sm:text-6xl font-mono tracking-widest scoreboard-digit">
                {formatClock(displayTimer)}
              </div>
              <div className="mt-3 flex flex-col items-center">
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Shot
                </span>
                <span className="text-3xl font-bold text-destructive shot-clock-glow font-mono scoreboard-digit">
                  {String(displayShot).padStart(2, "0")}
                </span>
              </div>
              <div className="mt-3">
                <StatusPill status={match.match_status} />
              </div>
            </div>

            {/* Away team */}
            <div className="flex flex-col items-center md:items-start text-center md:text-left">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground uppercase tracking-tight">
                {awayTeam.name}
              </h2>
              <div className="font-display text-[64px] sm:text-[72px] font-bold leading-none text-primary score-glow scoreboard-digit mt-2">
                {match.away_score}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5 text-[11px] uppercase tracking-[0.12em] font-bold">
                <span className="text-muted-foreground">Fouls:</span>
                <span className="text-primary">{match.away_team_fouls}</span>
              </div>
            </div>
          </div>
        </section>
        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
        <section className="arena-glass rounded-xl p-5 sm:p-6 shadow-xl">
          <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4">
            Score Share
          </h3>
          <div className="relative h-3 w-full bg-muted/70 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${homePct}%` }}
            />
            <div
              className="h-full bg-zinc-700 transition-all duration-500"
              style={{ width: `${awayPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 font-display text-[10px] font-bold uppercase tracking-[0.12em]">
            <span className="text-primary">
              {homeTeam.short_name} {homePct}%
            </span>
            <span className="text-zinc-400">
              {awayTeam.short_name} {awayPct}%
            </span>
          </div>

          <hr className="my-5 border-border/50" />

          <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">
            Match Info
          </h3>
          <ul className="space-y-3 text-sm">
            <InfoRow label="Quarter" value={`Q${match.current_period}`} />
            <InfoRow label="Time remaining" value={formatClock(displayTimer)} />
            <InfoRow
              label="Shot clock"
              value={String(displayShot).padStart(2, "0")}
            />
            <InfoRow label="Match type" value={match.match_type} />
            <InfoRow
              label="Status"
              value={<StatusPill status={match.match_status} />}
            />
          </ul>
        </section>

        </aside>
      </div>

      {/* On-court performance — full width row, two team tables side-by-side */}
      <section>
        <h3 className="font-display text-xl sm:text-2xl font-semibold text-foreground uppercase tracking-tight mb-3">
          On-Court Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamOnCourtTable
            team={homeTeam}
            accent="home"
            rows={onCourtRows.filter((r) => r.isHome)}
          />
          <TeamOnCourtTable
            team={awayTeam}
            accent="away"
            rows={onCourtRows.filter((r) => !r.isHome)}
          />
        </div>
      </section>

      {/* Bench — full width */}
      <BenchSection
        homeName={homeTeam.short_name}
        awayName={awayTeam.short_name}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
        statsByPlayer={statsByPlayer}
      />
    </div>
  );
}

function TeamOnCourtTable({
  team,
  accent,
  rows,
}: {
  team: Team;
  accent: "home" | "away";
  rows: {
    roster: RosterRow;
    stat: MatchPlayerStat | undefined;
    teamShort: string;
    isHome: boolean;
  }[];
}) {
  const accentBar =
    accent === "home" ? "bg-primary" : "bg-blue-500";
  const accentChip =
    accent === "home"
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-blue-500/30 bg-blue-500/10 text-blue-400";
  const jerseyChip =
    accent === "home"
      ? "bg-primary/15 text-primary"
      : "bg-blue-500/15 text-blue-400";

  return (
    <div className="arena-glass rounded-xl overflow-hidden shadow-xl">
      <div className={`h-1 w-full ${accentBar}`} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={
                "inline-flex items-center justify-center h-6 px-2 rounded border text-[10px] uppercase tracking-widest font-bold " +
                accentChip
              }
            >
              {team.short_name}
            </span>
            <h4 className="font-display font-semibold uppercase tracking-tight text-base sm:text-lg truncate">
              {team.name}
            </h4>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold whitespace-nowrap">
            {rows.length}/5
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 py-2">
            No players currently on court.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-2 pr-2 font-display text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Player
                </th>
                <th className="text-center py-2 px-2 font-display text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Pts
                </th>
                <th className="text-right py-2 pl-2 font-display text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  F
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ roster: r, stat }, i) => (
                <tr
                  key={r.id}
                  className={
                    "border-b border-border/20 " +
                    (i % 2 === 0 ? "bg-foreground/[0.02]" : "")
                  }
                >
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar
                        photoUrl={r.player?.photo_url ?? null}
                        jersey={r.jersey_number ?? null}
                        name={r.player?.display_name || r.player?.full_name || ""}
                        size={32}
                        fallbackChipClass={jerseyChip}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-foreground truncate">
                          {r.player?.display_name || r.player?.full_name || "—"}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-mono">
                          {r.jersey_number ? `#${r.jersey_number}` : ""}
                          {r.player?.position
                            ? `${r.jersey_number ? " · " : ""}${r.player.position}`
                            : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="text-center py-2.5 px-2 font-display text-lg font-bold text-primary scoreboard-digit">
                    {stat?.points ?? 0}
                  </td>
                  <td
                    className={
                      "text-right py-2.5 pl-2 text-base font-bold scoreboard-digit " +
                      ((stat?.fouls ?? 0) >= 3
                        ? "text-destructive"
                        : "text-foreground")
                    }
                  >
                    {stat?.fouls ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold text-foreground scoreboard-digit">
        {value}
      </span>
    </li>
  );
}

function StatusPill({ status }: { status: MatchStatus }) {
  const map: Record<MatchStatus, { label: string; cls: string }> = {
    live: {
      label: "LIVE",
      cls: "bg-red-500/15 text-red-400 border-red-400/30 animate-pulse",
    },
    completed: {
      label: "FINAL",
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-400/30",
    },
    paused: {
      label: "PAUSED",
      cls: "bg-amber-500/15 text-amber-400 border-amber-400/30",
    },
    cancelled: {
      label: "CANCELLED",
      cls: "bg-zinc-500/15 text-zinc-300 border-zinc-400/30",
    },
    scheduled: {
      label: "SCHEDULED",
      cls: "bg-zinc-700/30 text-zinc-300 border-zinc-500/30",
    },
  };
  const m = map[status];
  return (
    <span
      className={
        "inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest border " +
        m.cls
      }
    >
      {m.label}
    </span>
  );
}

function BenchSection({
  homeName,
  awayName,
  homeRoster,
  awayRoster,
  statsByPlayer,
}: {
  homeName: string;
  awayName: string;
  homeRoster: RosterRow[];
  awayRoster: RosterRow[];
  statsByPlayer: Map<string, MatchPlayerStat>;
}) {
  const homeBench = homeRoster.filter(
    (r) => !(statsByPlayer.get(r.player_id)?.is_active ?? false),
  );
  const awayBench = awayRoster.filter(
    (r) => !(statsByPlayer.get(r.player_id)?.is_active ?? false),
  );
  if (homeBench.length === 0 && awayBench.length === 0) return null;

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <BenchList title={homeName} rows={homeBench} statsByPlayer={statsByPlayer} />
      <BenchList title={awayName} rows={awayBench} statsByPlayer={statsByPlayer} />
    </section>
  );
}

function BenchList({
  title,
  rows,
  statsByPlayer,
}: {
  title: string;
  rows: RosterRow[];
  statsByPlayer: Map<string, MatchPlayerStat>;
}) {
  return (
    <div className="arena-glass rounded-xl p-4">
      <h4 className="font-display text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">
        {title} · Bench
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">— no bench players —</p>
      ) : (
        <ul className="text-sm divide-y divide-border/40">
          {rows.map((r) => {
            const stat = statsByPlayer.get(r.player_id);
            return (
              <li
                key={r.id}
                className="py-2 grid grid-cols-[1.75rem_2.25rem_1fr_3rem_3rem] gap-2 items-center text-muted-foreground/70"
              >
                <PlayerAvatar
                  photoUrl={r.player?.photo_url ?? null}
                  jersey={r.jersey_number ?? null}
                  name={r.player?.display_name || r.player?.full_name || ""}
                  size={24}
                  fallbackChipClass="bg-muted text-muted-foreground"
                />
                <span className="font-mono text-xs">
                  {r.jersey_number ?? "—"}
                </span>
                <span className="truncate">
                  {r.player?.display_name || r.player?.full_name || "—"}
                </span>
                <span className="text-right font-mono scoreboard-digit">
                  {stat?.points ?? 0}
                </span>
                <span className="text-right font-mono scoreboard-digit">
                  {stat?.fouls ?? 0}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PlayerAvatar({
  photoUrl,
  jersey,
  name,
  size,
  fallbackChipClass,
}: {
  photoUrl: string | null;
  jersey: string | null;
  name: string;
  size: number;
  fallbackChipClass: string;
}) {
  const dim = { width: size, height: size };
  const initial = (name.trim()[0] ?? "—").toUpperCase();

  return (
    <div className="relative shrink-0" style={dim}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          style={dim}
          className="rounded-full object-cover border border-border/40"
        />
      ) : (
        <div
          style={dim}
          className={
            "rounded-full grid place-items-center font-display font-bold " +
            (size <= 24 ? "text-[10px] " : "text-xs ") +
            fallbackChipClass
          }
        >
          {jersey ?? initial}
        </div>
      )}
      {photoUrl && jersey && (
        <span
          className={
            "absolute -bottom-0.5 -right-0.5 rounded-full bg-primary text-primary-foreground font-mono font-bold leading-none border border-background grid place-items-center " +
            (size <= 24
              ? "min-w-[14px] h-[14px] px-[3px] text-[8px]"
              : "min-w-[18px] h-[18px] px-1 text-[10px]")
          }
        >
          {jersey}
        </span>
      )}
    </div>
  );
}
