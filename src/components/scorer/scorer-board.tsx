"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  ArrowUpFromLine,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  Match,
  MatchPlayerStat,
  MatchStatus,
  Player,
  Team,
  TeamPlayer,
} from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useGlobalLoading } from "@/components/loading-provider";
import { cn, formatClock, parseClock } from "@/lib/utils";

export type RosterRow = TeamPlayer & {
  player: Pick<
    Player,
    "id" | "full_name" | "display_name" | "photo_url" | "position"
  > | null;
};

const ALL_STATUSES: MatchStatus[] = [
  "scheduled",
  "live",
  "paused",
  "completed",
  "cancelled",
];

const TIMER_PERSIST_MS = 5_000;
const MAX_ON_COURT = 5;
const MAX_PERSONAL_FOULS = 5;

export default function ScorerBoard({
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
  const toast = useToast();
  const loading = useGlobalLoading();

  const [match, setMatch] = useState<Match>(initialMatch);
  const [stats, setStats] = useState<MatchPlayerStat[]>(initialStats);
  const [busy, setBusy] = useState(false);

  // Local ticker
  const [, setTick] = useState(0);
  const localTimerRef = useRef(initialMatch.time_remaining_seconds);
  const localShotRef = useRef(initialMatch.shot_clock_seconds);
  const lastPersistRef = useRef(Date.now());

  useEffect(() => {
    if (!match.timer_running) {
      localTimerRef.current = match.time_remaining_seconds;
    }
    if (!match.shot_clock_running) {
      localShotRef.current = match.shot_clock_seconds;
    }
    lastPersistRef.current = Date.now();
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
        localTimerRef.current = Math.max(0, localTimerRef.current - 1);
        changed = true;
      }
      if (match.shot_clock_running && localShotRef.current > 0) {
        localShotRef.current = Math.max(0, localShotRef.current - 1);
        changed = true;
      }
      if (changed) setTick((t) => t + 1);

      const now = Date.now();
      if (now - lastPersistRef.current >= TIMER_PERSIST_MS) {
        lastPersistRef.current = now;
        void persistTimerSnapshot();
      }
    }, 1000);
    return () => window.clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.timer_running, match.shot_clock_running]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`scorer-match-${match.id}`)
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, match.id]);

  // Match patch — tracked by the global loader so a centered spinner shows
  // for any operation that takes longer than the loader's debounce window.
  async function patchMatch(patch: Partial<Match>, message?: string) {
    return loading.run(async () => {
      const optimistic = { ...match, ...patch };
      setMatch(optimistic);
      const { data, error } = await supabase
        .from("matches")
        .update(patch)
        .eq("id", match.id)
        .select()
        .single();
      if (error) {
        toast.push(error.message, "error");
        setMatch(initialMatch);
        return;
      }
      if (data) setMatch(data as Match);
    }, message);
  }

  // Timer snapshot persistence is silent — fires every 5s during play, no
  // overlay needed. We call supabase directly without `loading.run`.
  async function persistTimerSnapshot() {
    await supabase
      .from("matches")
      .update({
        time_remaining_seconds: localTimerRef.current,
        shot_clock_seconds: localShotRef.current,
      })
      .eq("id", match.id);
  }

  async function callRpc(
    name: string,
    args: Record<string, unknown>,
    message?: string,
  ) {
    if (busy) return;
    setBusy(true);
    return loading.run(async () => {
      try {
        const { error } = await supabase.rpc(name as never, args as never);
        if (error) throw error;
      } catch (err) {
        toast.push(
          err instanceof Error ? err.message : "Action failed.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    }, message);
  }

  // Score / foul actions
  function teamId(side: "home" | "away") {
    return side === "home" ? homeTeam.id : awayTeam.id;
  }
  async function addTeamPoints(side: "home" | "away", delta: number) {
    await callRpc("add_team_points", {
      p_match_id: match.id,
      p_team_id: teamId(side),
      p_delta: delta,
    });
  }
  async function addPlayerPoints(playerId: string, tId: string, delta: number) {
    // Positive deltas of 1/2/3 are recorded as a made shot of that value so
    // the per-bucket pts_1/pts_2/pts_3 counters get updated alongside the
    // total. Anything else (undo, manual adjust) goes through the generic
    // delta RPC which only touches the total.
    if (delta === 1 || delta === 2 || delta === 3) {
      await callRpc("record_player_made_shot", {
        p_match_id: match.id,
        p_team_id: tId,
        p_player_id: playerId,
        p_point_value: delta,
      });
      return;
    }
    await callRpc("add_player_points", {
      p_match_id: match.id,
      p_team_id: tId,
      p_player_id: playerId,
      p_delta: delta,
    });
  }
  async function addTeamFoul(side: "home" | "away", delta: number) {
    await callRpc("add_team_foul", {
      p_match_id: match.id,
      p_team_id: teamId(side),
      p_delta: delta,
    });
  }
  async function addPlayerFoul(playerId: string, tId: string, delta: number) {
    await callRpc("add_player_foul", {
      p_match_id: match.id,
      p_team_id: tId,
      p_player_id: playerId,
      p_delta: delta,
    });
  }

  // Substitution helpers
  async function substitute(tId: string, outId: string, inId: string) {
    await callRpc("substitute_player", {
      p_match_id: match.id,
      p_team_id: tId,
      p_out_player_id: outId,
      p_in_player_id: inId,
    });
  }

  async function setIsActive(playerId: string, isActive: boolean) {
    if (busy) return;
    setBusy(true);
    return loading.run(async () => {
      try {
        const { error } = await supabase
          .from("match_player_stats")
          .update({ is_active: isActive })
          .eq("match_id", match.id)
          .eq("player_id", playerId);
        if (error) throw error;
      } catch (err) {
        toast.push(
          err instanceof Error ? err.message : "Action failed.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    }, isActive ? "Subbing in…" : "Subbing out…");
  }

  async function initializeRoster() {
    await callRpc(
      "seed_match_roster",
      { p_match_id: match.id },
      "Initializing roster…",
    );
    toast.push("Roster initialized.", "success");
  }

  // Timer / shot-clock controls
  // One toggle drives both clocks — when you start the match timer the shot
  // clock also runs, when you pause one both pause.
  async function toggleTimer() {
    if (match.timer_running) {
      await persistTimerSnapshot();
      await patchMatch({
        timer_running: false,
        shot_clock_running: false,
        time_remaining_seconds: localTimerRef.current,
        shot_clock_seconds: localShotRef.current,
      });
    } else {
      await patchMatch({
        timer_running: true,
        shot_clock_running: true,
        match_status:
          match.match_status === "scheduled" || match.match_status === "paused"
            ? "live"
            : match.match_status,
      });
    }
  }
  async function resetPeriodTimer() {
    // Reset Q resets the period timer, the shot clock, and clears the
    // accumulated team fouls (team fouls are per-quarter in basketball).
    localTimerRef.current = match.period_duration_seconds;
    localShotRef.current = 24;
    await patchMatch({
      time_remaining_seconds: match.period_duration_seconds,
      timer_running: false,
      shot_clock_seconds: 24,
      shot_clock_running: false,
      home_team_fouls: 0,
      away_team_fouls: 0,
    });
  }
  async function setShotClock(value: number) {
    localShotRef.current = value;
    // If the match timer is running, the shot clock should keep running too —
    // a 24/14 reset is mid-play and the new shot clock starts ticking immediately.
    // If the timer is paused, leave the shot clock paused as well.
    await patchMatch({
      shot_clock_seconds: value,
      shot_clock_running: match.timer_running,
    });
  }
  async function setStatus(s: MatchStatus) {
    const patch: Partial<Match> = { match_status: s };
    if (s !== "live") {
      patch.timer_running = false;
      patch.shot_clock_running = false;
    }
    await patchMatch(patch);
  }
  async function setPeriod(p: number) {
    if (p < 1 || p > 10) return;
    await patchMatch({ current_period: p });
  }

  // Custom time
  const [timeEditing, setTimeEditing] = useState(false);
  const [timeInput, setTimeInput] = useState(
    formatClock(match.time_remaining_seconds),
  );
  const commitTime = useCallback(async () => {
    const seconds = parseClock(timeInput);
    if (seconds == null) {
      toast.push("Use mm:ss or seconds.", "error");
      return;
    }
    localTimerRef.current = seconds;
    setTimeEditing(false);
    await patchMatch({
      time_remaining_seconds: seconds,
      timer_running: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeInput]);

  // Derived
  const homeStats = useMemo(
    () => stats.filter((s) => s.team_id === homeTeam.id),
    [stats, homeTeam.id],
  );
  const awayStats = useMemo(
    () => stats.filter((s) => s.team_id === awayTeam.id),
    [stats, awayTeam.id],
  );

  const displayTimer = match.timer_running
    ? localTimerRef.current
    : match.time_remaining_seconds;
  const displayShot = match.shot_clock_running
    ? localShotRef.current
    : match.shot_clock_seconds;

  const homeRoster = roster.filter((r) => r.team_id === homeTeam.id);
  const awayRoster = roster.filter((r) => r.team_id === awayTeam.id);
  const rosterMissing =
    stats.length === 0 && (homeRoster.length > 0 || awayRoster.length > 0);

  // Build on-court chip lists for the inline scoring picker.
  const statsByPlayerId = useMemo(() => {
    const m = new Map<string, MatchPlayerStat>();
    for (const s of stats) m.set(s.player_id, s);
    return m;
  }, [stats]);

  const homeOnCourt = homeRoster
    .map((r) => ({ row: r, stat: statsByPlayerId.get(r.player_id) }))
    .filter((d) => d.stat?.is_active);
  const awayOnCourt = awayRoster
    .map((r) => ({ row: r, stat: statsByPlayerId.get(r.player_id) }))
    .filter((d) => d.stat?.is_active);

  // Foul-out alerts. Fire ONCE per player when they cross to 5 fouls while
  // on court. If their fouls go back below 5 (e.g. an undo), the dedupe slot
  // clears so the alert can re-fire if it happens again.
  const foulOutNotifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const stillFouledOut = new Set<string>();
    for (const s of stats) {
      if ((s.fouls ?? 0) >= MAX_PERSONAL_FOULS && s.is_active) {
        stillFouledOut.add(s.player_id);
        if (!foulOutNotifiedRef.current.has(s.player_id)) {
          foulOutNotifiedRef.current.add(s.player_id);
          const row = roster.find((r) => r.player_id === s.player_id);
          const teamShort =
            s.team_id === homeTeam.id
              ? homeTeam.short_name
              : awayTeam.short_name;
          const name =
            row?.player?.display_name ||
            row?.player?.full_name ||
            "A player";
          toast.push(
            `${name} (${teamShort}) has reached ${MAX_PERSONAL_FOULS} fouls — fouled out. Substitute them off court.`,
            "error",
          );
        }
      }
    }
    // Drop any player who is no longer at 5+ fouls or no longer on court so
    // they can be re-flagged later if needed.
    for (const id of Array.from(foulOutNotifiedRef.current)) {
      if (!stillFouledOut.has(id)) foulOutNotifiedRef.current.delete(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  // ONE shared scoring selection across both teams. Tapping an on-court card
  // in either TeamPanel writes here; the ScoringPanel above match controls
  // reads from this and routes points/fouls to the correct team_id.
  const [selectedScoringPlayer, setSelectedScoringPlayer] = useState<{
    playerId: string;
    teamId: string;
  } | null>(null);

  // If the selected player has been subbed off court (e.g. via realtime
  // update from another scorer), drop the selection.
  useEffect(() => {
    if (!selectedScoringPlayer) return;
    const stat = stats.find(
      (s) => s.player_id === selectedScoringPlayer.playerId,
    );
    if (!stat?.is_active) setSelectedScoringPlayer(null);
  }, [selectedScoringPlayer, stats]);

  // Resolve the display fields for the currently-selected player (jersey,
  // name, points, fouls). Returns null if nothing selected.
  const selectedScoringInfo = useMemo(() => {
    if (!selectedScoringPlayer) return null;
    const row = roster.find(
      (r) => r.player_id === selectedScoringPlayer.playerId,
    );
    const stat = stats.find(
      (s) => s.player_id === selectedScoringPlayer.playerId,
    );
    if (!row) return null;
    const team =
      selectedScoringPlayer.teamId === homeTeam.id ? homeTeam : awayTeam;
    return {
      jersey: row.jersey_number ?? null,
      name: row.player?.display_name || row.player?.full_name || "—",
      photoUrl: row.player?.photo_url ?? null,
      points: stat?.points ?? 0,
      fouls: stat?.fouls ?? 0,
      teamShort: team.short_name,
    };
  }, [selectedScoringPlayer, roster, stats, homeTeam, awayTeam]);

  function bumpSelectedPoints(delta: number) {
    if (!selectedScoringPlayer) return;
    const currentFouls = selectedScoringInfo?.fouls ?? 0;
    if (currentFouls >= MAX_PERSONAL_FOULS) {
      toast.push(
        `${selectedScoringInfo?.name ?? "Player"} reached five fouls. Change the player.`,
        "error",
      );
      return;
    }
    addPlayerPoints(
      selectedScoringPlayer.playerId,
      selectedScoringPlayer.teamId,
      delta,
    );
  }
  function bumpSelectedFoul(delta: number) {
    if (!selectedScoringPlayer) return;
    // Foul +/- is always allowed so the scorer can correct mistakes even on
    // a fouled-out player.
    addPlayerFoul(
      selectedScoringPlayer.playerId,
      selectedScoringPlayer.teamId,
      delta,
    );
  }

  return (
    <div className="space-y-3 pb-40">
      {/* Sticky match sub-header */}
      <div className="sticky top-14 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b">
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/admin/matches"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1 h-8 px-2",
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Matches</span>
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold truncate leading-tight">
                {homeTeam.name}
                <span className="text-muted-foreground"> vs </span>
                {awayTeam.name}
              </h1>
              <div className="text-[11px] text-muted-foreground leading-tight">
                Quarter {match.current_period} · {match.match_type}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={match.match_status} />
            <Link
              href={`/live/match/${match.id}`}
              target="_blank"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1 h-8 px-2",
              )}
            >
              <span className="hidden sm:inline text-xs">Public</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Big scoreboard */}
      <ScoreboardPanel
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeScore={match.home_score}
        awayScore={match.away_score}
        homeFouls={match.home_team_fouls}
        awayFouls={match.away_team_fouls}
        period={match.current_period}
        timer={displayTimer}
        shot={displayShot}
        timerRunning={match.timer_running}
        shotRunning={match.shot_clock_running}
        status={match.match_status}
      />

      {rosterMissing && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Match roster not initialized.</div>
              <p className="text-sm text-muted-foreground">
                Create per-player stat rows so you can score and substitute.
              </p>
            </div>
            <Button onClick={initializeRoster} disabled={busy}>
              Initialize match roster
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Inline scoring section — on-court chips + score buttons together,
          so picking a player and tapping a point happens in one viewport. */}
      <ScoringSection
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeOnCourt={homeOnCourt}
        awayOnCourt={awayOnCourt}
        selectedPlayerId={selectedScoringPlayer?.playerId ?? null}
        selectedInfo={selectedScoringInfo}
        disabled={busy}
        onSelect={(playerId, teamId) =>
          setSelectedScoringPlayer({ playerId, teamId })
        }
        onPoints={bumpSelectedPoints}
        onFoul={bumpSelectedFoul}
        onClear={() => setSelectedScoringPlayer(null)}
      />

      {/* Match controls */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Match controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Button
              size="sm"
              variant={match.timer_running ? "destructive" : "success"}
              onClick={toggleTimer}
              className="gap-1.5 h-9 font-semibold text-xs"
              title="Starts and pauses both the match clock and the shot clock"
            >
              {match.timer_running ? (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> Start
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={resetPeriodTimer}
              className="gap-1.5 h-9 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Q
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPeriod(match.current_period - 1)}
              disabled={match.current_period <= 1}
              className="h-9 text-xs"
            >
              ‹ Prev Q
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPeriod(match.current_period + 1)}
              disabled={match.current_period >= 10}
              className="h-9 text-xs"
            >
              Next Q ›
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShotClock(24)}
              className="h-9 font-mono font-bold text-xs"
            >
              Shot 24
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShotClock(14)}
              className="h-9 font-mono font-bold text-xs"
            >
              Shot 14
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Custom time
              </Label>
              {timeEditing ? (
                <div className="flex gap-1.5">
                  <Input
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitTime();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setTimeEditing(false);
                      }
                    }}
                    placeholder="mm:ss"
                    autoFocus
                    className="w-20 h-8 font-mono text-sm"
                  />
                  <Button size="sm" onClick={commitTime} className="h-8 text-xs">
                    Set
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTimeEditing(false)}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTimeInput(formatClock(displayTimer));
                    setTimeEditing(true);
                  }}
                  className="font-mono text-sm border rounded-md px-3 py-1 h-8 hover:bg-muted scoreboard-digit"
                >
                  {formatClock(displayTimer)}
                </button>
              )}
            </div>

            <div className="space-y-1 flex-1 min-w-[240px]">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Status
              </Label>
              <div className="flex flex-wrap gap-1">
                {ALL_STATUSES.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={match.match_status === s ? "default" : "outline"}
                    onClick={() => setStatus(s)}
                    className="h-8 px-2.5 text-xs capitalize"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time outs — pauses both clocks and runs a 60s countdown */}
      <TimeoutPanel
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        disabled={busy}
        onPauseMatch={async () => {
          if (!match.timer_running && !match.shot_clock_running) return;
          await patchMatch({
            timer_running: false,
            shot_clock_running: false,
            time_remaining_seconds: localTimerRef.current,
            shot_clock_seconds: localShotRef.current,
          });
        }}
      />

      {/* Substitution panels — quick-swap dropdown + bench. On-court roster
          is shown as chips inside the scoring section above, no duplication. */}
      <div className="grid lg:grid-cols-2 gap-4">
        <TeamPanel
          team={homeTeam}
          accent="home"
          roster={homeRoster}
          stats={homeStats}
          disabled={busy}
          onSwap={(outId, inId) => substitute(homeTeam.id, outId, inId)}
          onSetActive={setIsActive}
        />
        <TeamPanel
          team={awayTeam}
          accent="away"
          roster={awayRoster}
          stats={awayStats}
          disabled={busy}
          onSwap={(outId, inId) => substitute(awayTeam.id, outId, inId)}
          onSetActive={setIsActive}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Scoreboard panel
// =============================================================================
function ScoreboardPanel({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  homeFouls,
  awayFouls,
  period,
  timer,
  shot,
  timerRunning,
  shotRunning,
  status,
}: {
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  homeFouls: number;
  awayFouls: number;
  period: number;
  timer: number;
  shot: number;
  timerRunning: boolean;
  shotRunning: boolean;
  status: MatchStatus;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-card via-card to-background shadow-lg">
      {/* Top accent strip — orange home / blue away split */}
      <div className="absolute top-0 inset-x-0 h-1 flex">
        <div className="flex-1 bg-primary" />
        <div className="flex-1 bg-blue-500" />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-5 px-3 sm:px-6 py-3 sm:py-4">
        <TeamHeader
          team={homeTeam}
          score={homeScore}
          fouls={homeFouls}
          accent="home"
        />

        <div className="flex flex-col items-center gap-1.5 min-w-[7rem] sm:min-w-[11rem]">
          <div className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Quarter {period}
          </div>
          <div
            className={cn(
              "font-mono text-3xl sm:text-5xl font-black scoreboard-digit leading-none transition-colors",
              timerRunning ? "text-emerald-500" : "text-foreground",
            )}
          >
            {formatClock(timer)}
          </div>

          <div
            className={cn(
              "inline-flex items-baseline gap-1 rounded-full px-2.5 py-0.5 border font-mono scoreboard-digit",
              shotRunning
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            <span className="text-base sm:text-lg font-bold leading-none">
              {String(shot).padStart(2, "0")}
            </span>
            <span className="text-[9px] uppercase tracking-widest opacity-80">
              shot
            </span>
          </div>

          <StatusPill status={status} />
        </div>

        <TeamHeader
          team={awayTeam}
          score={awayScore}
          fouls={awayFouls}
          accent="away"
        />
      </div>
    </div>
  );
}

function TeamHeader({
  team,
  score,
  fouls,
  accent,
}: {
  team: Team;
  score: number;
  fouls: number;
  accent: "home" | "away";
}) {
  const accentColor = accent === "home" ? "text-primary" : "text-blue-500";
  const ringClass =
    accent === "home"
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-blue-500/30 bg-blue-500/10 text-blue-500";
  return (
    <div
      className={cn(
        "min-w-0 w-full flex gap-2 sm:gap-5",
        // Mobile: stack vertically and center so the logo + score have room.
        // sm+: keep the horizontal in-row layout requested for desktop.
        "flex-col items-center text-center",
        accent === "home"
          ? "sm:flex-row sm:items-center sm:justify-start sm:text-left"
          : "sm:flex-row-reverse sm:items-center sm:justify-start sm:text-right",
      )}
    >
      {/* Big logo — sits above the score on mobile, beside it on sm+ */}
      <div className="aspect-square shrink-0 h-16 sm:h-36 md:h-44">
        {team.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.logo_url}
            alt={team.name}
            className="w-full h-full rounded-xl object-contain border bg-background/60"
          />
        ) : (
          <div
            className={cn(
              "w-full h-full rounded-xl border grid place-items-center font-display font-bold uppercase tracking-wider",
              ringClass,
            )}
          >
            <span className="text-2xl sm:text-5xl">
              {team.short_name?.slice(0, 3) ?? "—"}
            </span>
          </div>
        )}
      </div>

      {/* Name / score / team-fouls stack */}
      <div
        className={cn(
          "min-w-0 flex flex-col",
          "items-center",
          accent === "home"
            ? "sm:items-start sm:text-left"
            : "sm:items-end sm:text-right",
        )}
      >
        <div className="font-display font-bold text-sm sm:text-2xl md:text-3xl uppercase tracking-tight truncate max-w-full">
          {team.name}
        </div>
        <div
          className={cn(
            "font-mono text-5xl sm:text-8xl md:text-9xl font-black scoreboard-digit leading-none my-1 sm:my-2",
            accentColor,
          )}
        >
          {score}
        </div>
        <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          Team Fouls{" "}
          <span className="font-mono font-bold text-foreground">{fouls}</span>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: MatchStatus }) {
  if (status === "live") return <Badge variant="live">LIVE</Badge>;
  if (status === "completed") return <Badge variant="success">FINAL</Badge>;
  if (status === "paused") return <Badge variant="warn">PAUSED</Badge>;
  if (status === "cancelled")
    return <Badge variant="destructive">CANCELLED</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

// =============================================================================
// Team score card
// =============================================================================
function TeamScoreCard({
  team,
  score,
  fouls,
  accent,
  onPoints,
  onFoul,
  disabled,
}: {
  team: Team;
  score: number;
  fouls: number;
  accent: "home" | "away";
  onPoints: (delta: number) => void;
  onFoul: (delta: number) => void;
  disabled: boolean;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden",
        accent === "home" && "border-primary/30",
      )}
    >
      <div
        className={cn(
          "h-1 w-full",
          accent === "home" ? "bg-primary" : "bg-blue-500",
        )}
      />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <TeamLogoBadge team={team} size={44} />
            <span className="truncate">
              {team.short_name}{" "}
              <span className="text-muted-foreground font-normal text-sm">
                · {team.name}
              </span>
            </span>
          </span>
          <span className="font-mono text-3xl scoreboard-digit">{score}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Button size="xl" onClick={() => onPoints(1)} disabled={disabled}>
            +1
          </Button>
          <Button size="xl" onClick={() => onPoints(2)} disabled={disabled}>
            +2
          </Button>
          <Button size="xl" onClick={() => onPoints(3)} disabled={disabled}>
            +3
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            onClick={() => onPoints(-1)}
            disabled={disabled}
            title="Correct: −1 from team total"
          >
            −1 score
          </Button>
          <Button
            variant="outline"
            onClick={() => onFoul(1)}
            disabled={disabled}
            className="border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700"
          >
            + Team foul ({fouls})
          </Button>
          <Button
            variant="outline"
            onClick={() => onFoul(-1)}
            disabled={disabled}
          >
            − Team foul
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Team panel — substitution + on-court / bench
// =============================================================================
function TeamPanel({
  team,
  accent,
  roster,
  stats,
  disabled,
  onSwap,
  onSetActive,
}: {
  team: Team;
  accent: "home" | "away";
  roster: RosterRow[];
  stats: MatchPlayerStat[];
  disabled: boolean;
  onSwap: (outId: string, inId: string) => void;
  onSetActive: (playerId: string, isActive: boolean) => void;
}) {
  const toast = useToast();
  const statsByPlayer = useMemo(() => {
    const m = new Map<string, MatchPlayerStat>();
    for (const s of stats) m.set(s.player_id, s);
    return m;
  }, [stats]);

  const decorated = useMemo(
    () =>
      roster.map((r) => ({
        roster: r,
        stat: statsByPlayer.get(r.player_id),
        isActive: statsByPlayer.get(r.player_id)?.is_active ?? false,
      })),
    [roster, statsByPlayer],
  );
  const onCourt = decorated.filter((d) => d.isActive);
  const bench = decorated.filter((d) => !d.isActive);

  function handleSubIn(playerId: string) {
    if (onCourt.length < MAX_ON_COURT) {
      onSetActive(playerId, true);
      toast.push("Player added to court.", "success");
      return;
    }
    toast.push("Use the quick-swap dropdown to substitute.", "error");
  }

  // Quick swap dropdown state
  const [quickOut, setQuickOut] = useState("");
  const [quickIn, setQuickIn] = useState("");

  function handleQuickSwap() {
    if (!quickOut || !quickIn) {
      toast.push("Select both an out and an in player.", "error");
      return;
    }
    if (quickOut === quickIn) {
      toast.push("Out and In must be different players.", "error");
      return;
    }
    onSwap(quickOut, quickIn);
    setQuickOut("");
    setQuickIn("");
    toast.push("Substitution completed.", "success");
  }

  if (roster.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{team.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active players assigned to this team for the season.
          </p>
        </CardContent>
      </Card>
    );
  }

  const accentRingClass =
    accent === "home"
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-blue-500/30 bg-blue-500/10 text-blue-500";

  return (
    <Card
      className={cn(
        accent === "home" ? "border-primary/20" : "border-blue-500/20",
      )}
    >
      <div
        className={cn(
          "h-1.5 w-full rounded-t-lg",
          accent === "home" ? "bg-primary" : "bg-blue-500",
        )}
      />
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogoBadge team={team} size={44} accentChipClass={accentRingClass} />
            <div
              className={cn(
                "inline-flex items-center justify-center h-7 px-2 rounded-md border text-[10px] uppercase tracking-widest font-bold",
                accentRingClass,
              )}
            >
              {team.short_name}
            </div>
            <span className="truncate">{team.name}</span>
          </div>
          <Badge
            variant={onCourt.length === MAX_ON_COURT ? "success" : "outline"}
            className="font-mono"
          >
            {onCourt.length}/{MAX_ON_COURT} on court
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick swap dropdowns */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Quick substitution
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Sub out</Label>
              <SearchableRosterSelect
                value={quickOut}
                onChange={setQuickOut}
                rows={onCourt.map((d) => d.roster)}
                placeholder="— pick on-court player —"
                emptyLabel="No on-court players"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sub in</Label>
              <SearchableRosterSelect
                value={quickIn}
                onChange={setQuickIn}
                rows={bench.map((d) => d.roster)}
                placeholder="— pick bench player —"
                emptyLabel="No bench players"
              />
            </div>
            <Button onClick={handleQuickSwap} disabled={disabled}>
              Swap
            </Button>
          </div>
        </div>

        {/* Bench */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Bench
          </div>
          {bench.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No bench players available.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {bench.map(({ roster: r, stat }) => (
                <li key={r.id}>
                  <BenchPlayerCard
                    row={r}
                    stat={stat}
                    disabled={disabled}
                    canSubFreely={onCourt.length < MAX_ON_COURT}
                    onSubIn={() => handleSubIn(r.player_id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Shared scoring section — chips + buttons in one viewport.
// =============================================================================
function ScoringSection({
  homeTeam,
  awayTeam,
  homeOnCourt,
  awayOnCourt,
  selectedPlayerId,
  selectedInfo,
  disabled,
  onSelect,
  onPoints,
  onFoul,
  onClear,
}: {
  homeTeam: Team;
  awayTeam: Team;
  homeOnCourt: { row: RosterRow; stat: MatchPlayerStat | undefined }[];
  awayOnCourt: { row: RosterRow; stat: MatchPlayerStat | undefined }[];
  selectedPlayerId: string | null;
  selectedInfo: {
    jersey: string | null;
    name: string;
    photoUrl: string | null;
    points: number;
    fouls: number;
    teamShort?: string;
  } | null;
  disabled: boolean;
  onSelect: (playerId: string, teamId: string) => void;
  onPoints: (delta: number) => void;
  onFoul: (delta: number) => void;
  onClear: () => void;
}) {
  const enabled = !!selectedInfo && !disabled;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4 space-y-2.5 transition-all",
        selectedInfo
          ? "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/50 shadow-sm"
          : "bg-muted/20 border-dashed border-border",
      )}
    >
      {/* Header (compact) */}
      <div className="flex items-center justify-between gap-2 min-h-[1.75rem]">
        <div className="min-w-0 flex-1">
          {selectedInfo ? (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedInfo.teamShort && (
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                  {selectedInfo.teamShort}
                </Badge>
              )}
              {selectedInfo.photoUrl ? (
                <span className="relative shrink-0 h-7 w-7">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedInfo.photoUrl}
                    alt={selectedInfo.name}
                    className="h-full w-full rounded-full object-cover border border-border/60"
                  />
                  {selectedInfo.jersey && (
                    <span className="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-primary-foreground font-mono text-[8px] font-bold leading-none grid place-items-center border border-background">
                      {selectedInfo.jersey}
                    </span>
                  )}
                </span>
              ) : (
                selectedInfo.jersey && (
                  <span className="inline-grid place-items-center h-6 w-6 rounded bg-primary text-primary-foreground font-mono text-xs font-bold shrink-0">
                    {selectedInfo.jersey}
                  </span>
                )
              )}
              <span className="font-semibold text-sm sm:text-base truncate">
                {selectedInfo.name}
              </span>
              <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">
                <span className="font-mono font-bold text-foreground">
                  {selectedInfo.points}
                </span>
                pts ·{" "}
                <span className="font-mono font-bold text-foreground">
                  {selectedInfo.fouls}
                </span>
                f
              </span>
            </div>
          ) : (
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Tap an on-court player below to score
            </div>
          )}
        </div>
        {selectedInfo && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="gap-1 shrink-0 h-7 px-2 text-xs"
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* On-court chip rows — both teams side-by-side, compact on mobile */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        <ChipRow
          team={homeTeam}
          accent="home"
          rows={homeOnCourt}
          selectedPlayerId={selectedPlayerId}
          onSelect={(pid) => onSelect(pid, homeTeam.id)}
        />
        <ChipRow
          team={awayTeam}
          accent="away"
          rows={awayOnCourt}
          selectedPlayerId={selectedPlayerId}
          onSelect={(pid) => onSelect(pid, awayTeam.id)}
        />
      </div>

      {/* Score buttons */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          onClick={() => onPoints(1)}
          disabled={!enabled}
          className="h-11 sm:h-12 text-base sm:text-lg font-bold"
        >
          +1
        </Button>
        <Button
          onClick={() => onPoints(2)}
          disabled={!enabled}
          className="h-11 sm:h-12 text-base sm:text-lg font-bold"
        >
          +2
        </Button>
        <Button
          onClick={() => onPoints(3)}
          disabled={!enabled}
          className="h-11 sm:h-12 text-base sm:text-lg font-bold"
        >
          +3
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          onClick={() => onPoints(-1)}
          disabled={!enabled}
          className="h-9 text-xs font-medium"
        >
          −1 pt
        </Button>
        <Button
          variant="outline"
          onClick={() => onFoul(1)}
          disabled={!enabled}
          className="h-9 text-xs font-medium border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700"
        >
          + Foul
        </Button>
        <Button
          variant="outline"
          onClick={() => onFoul(-1)}
          disabled={!enabled}
          className="h-9 text-xs font-medium"
        >
          − Foul
        </Button>
      </div>
    </div>
  );
}

function ChipRow({
  team,
  accent,
  rows,
  selectedPlayerId,
  onSelect,
}: {
  team: Team;
  accent: "home" | "away";
  rows: { row: RosterRow; stat: MatchPlayerStat | undefined }[];
  selectedPlayerId: string | null;
  onSelect: (playerId: string) => void;
}) {
  const accentClass =
    accent === "home"
      ? "border-primary/30 text-primary"
      : "border-blue-500/30 text-blue-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center justify-center h-4 px-1.5 rounded border text-[9px] uppercase tracking-widest font-bold",
            accentClass,
          )}
        >
          {team.short_name}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {rows.length}/5
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">No players</p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-2">
          {rows.map(({ row: r, stat }) => {
            const selected = r.player_id === selectedPlayerId;
            const fouls = stat?.fouls ?? 0;
            const fouledOut = fouls >= MAX_PERSONAL_FOULS;
            const foulWarning = !fouledOut && fouls >= 3;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.player_id)}
                aria-pressed={selected}
                aria-disabled={fouledOut || undefined}
                title={
                  fouledOut
                    ? "Player has reached 5 fouls — change the player"
                    : foulWarning
                    ? `${fouls} fouls — one more and they're close to fouling out`
                    : undefined
                }
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 pl-1 pr-2 sm:pl-1.5 sm:pr-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg border text-xs sm:text-sm transition-colors w-full sm:w-auto",
                  selected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : fouledOut
                    ? "bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/40 border-red-300 dark:border-red-700/60 text-red-900 dark:text-red-100"
                    : foulWarning
                    ? "bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/40 border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-100"
                    : "bg-card hover:bg-accent border-border",
                )}
              >
                <span className="relative shrink-0 h-6 w-6 sm:h-9 sm:w-9">
                  {r.player?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.player.photo_url}
                      alt={r.player.display_name || r.player.full_name || ""}
                      className={cn(
                        "h-full w-full rounded-full object-cover border",
                        selected ? "border-primary-foreground/40" : "border-border",
                      )}
                    />
                  ) : (
                    <span
                      className={cn(
                        "h-full w-full grid place-items-center rounded-full font-mono text-[11px] sm:text-sm font-bold",
                        selected
                          ? "bg-primary-foreground/20"
                          : "bg-primary/15 text-primary",
                      )}
                    >
                      {r.jersey_number ?? "—"}
                    </span>
                  )}
                  {r.player?.photo_url && r.jersey_number && (
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 min-w-[14px] sm:min-w-[18px] h-[14px] sm:h-[18px] px-[3px] sm:px-1 rounded-full font-mono text-[8px] sm:text-[10px] font-bold leading-none grid place-items-center border border-background",
                        selected
                          ? "bg-primary-foreground text-primary"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {r.jersey_number}
                    </span>
                  )}
                </span>
                <span className="font-semibold truncate flex-1 text-left sm:max-w-[8rem]">
                  {r.player?.display_name || r.player?.full_name || "—"}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 font-mono text-[10px] sm:text-[11px] tabular-nums shrink-0",
                    selected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  <span>
                    <span className="font-bold">{stat?.points ?? 0}</span>p
                  </span>
                  <span
                    className={cn(
                      !selected && fouls >= 3 && "text-destructive",
                    )}
                  >
                    <span className="font-bold">{fouls}</span>f
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoringPanel({
  selected,
  disabled,
  onPoints,
  onFoul,
  onClear,
}: {
  selected: {
    jersey: string | null;
    name: string;
    points: number;
    fouls: number;
    teamShort?: string;
  } | null;
  disabled: boolean;
  onPoints: (delta: number) => void;
  onFoul: (delta: number) => void;
  onClear: () => void;
}) {
  const enabled = !!selected && !disabled;

  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-4 sm:p-5 space-y-4 transition-all",
        selected
          ? "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/50 shadow-md"
          : "bg-muted/20 border-dashed border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Score · selected player
          </div>
          {selected ? (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {selected.teamShort && (
                <Badge variant="outline" className="font-mono text-xs">
                  {selected.teamShort}
                </Badge>
              )}
              {selected.jersey && (
                <span className="inline-grid place-items-center h-7 w-7 rounded-md bg-primary text-primary-foreground font-mono text-sm font-bold shrink-0">
                  {selected.jersey}
                </span>
              )}
              <span className="font-semibold text-base sm:text-lg truncate">
                {selected.name}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                PTS{" "}
                <span className="font-mono font-bold text-foreground">
                  {selected.points}
                </span>
                {"  ·  "}F{" "}
                <span className="font-mono font-bold text-foreground">
                  {selected.fouls}
                </span>
              </span>
            </div>
          ) : (
            <div className="mt-1.5 text-sm text-muted-foreground">
              Tap an on-court player below to start scoring.
            </div>
          )}
        </div>
        {selected && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="gap-1 shrink-0"
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Button
          onClick={() => onPoints(1)}
          disabled={!enabled}
          className="h-14 sm:h-16 text-xl sm:text-2xl font-bold"
        >
          +1
        </Button>
        <Button
          onClick={() => onPoints(2)}
          disabled={!enabled}
          className="h-14 sm:h-16 text-xl sm:text-2xl font-bold"
        >
          +2
        </Button>
        <Button
          onClick={() => onPoints(3)}
          disabled={!enabled}
          className="h-14 sm:h-16 text-xl sm:text-2xl font-bold"
        >
          +3
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Button
          variant="outline"
          onClick={() => onPoints(-1)}
          disabled={!enabled}
          className="h-11 font-medium"
        >
          −1 pt
        </Button>
        <Button
          variant="outline"
          onClick={() => onFoul(1)}
          disabled={!enabled}
          className="h-11 font-medium border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700"
        >
          + Foul
        </Button>
        <Button
          variant="outline"
          onClick={() => onFoul(-1)}
          disabled={!enabled}
          className="h-11 font-medium"
        >
          − Foul
        </Button>
      </div>
    </div>
  );
}

function SearchableRosterSelect({
  value,
  onChange,
  rows,
  placeholder,
  emptyLabel,
}: {
  value: string;
  onChange: (playerId: string) => void;
  rows: RosterRow[];
  placeholder: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => rows.find((r) => r.player_id === value) ?? null,
    [rows, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const jersey = (r.jersey_number ?? "").toLowerCase();
      const display = (r.player?.display_name ?? "").toLowerCase();
      const full = (r.player?.full_name ?? "").toLowerCase();
      return jersey.includes(q) || display.includes(q) || full.includes(q);
    });
  }, [rows, query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      // Focus the search input after the popover renders.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function pick(playerId: string) {
    onChange(playerId);
    setOpen(false);
  }

  function rowLabel(r: RosterRow) {
    const name = r.player?.display_name || r.player?.full_name || "—";
    return r.jersey_number ? `#${r.jersey_number} ${name}` : name;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "w-full flex items-center justify-between gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm text-left",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate">{selected ? rowLabel(selected) : placeholder}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jersey or name…"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-56 overflow-auto pt-1 pb-2">
            {rows.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground italic">
                {emptyLabel}
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground italic">
                No players match &quot;{query}&quot;.
              </li>
            ) : (
              filtered.map((r) => {
                const name =
                  r.player?.display_name || r.player?.full_name || "—";
                const isSelected = r.player_id === value;
                return (
                  <li key={r.player_id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => pick(r.player_id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left rounded-sm",
                        "hover:bg-accent hover:text-accent-foreground",
                        isSelected && "bg-accent/60",
                      )}
                    >
                      <span className="relative shrink-0 h-7 w-7">
                        {r.player?.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.player.photo_url}
                            alt={name}
                            className="h-full w-full rounded-full object-cover border"
                          />
                        ) : (
                          <span className="h-full w-full grid place-items-center rounded-full bg-primary/15 text-primary font-mono text-xs font-bold">
                            {r.jersey_number ?? "—"}
                          </span>
                        )}
                        {r.player?.photo_url && r.jersey_number && (
                          <span className="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-primary-foreground font-mono text-[8px] font-bold leading-none grid place-items-center border border-background">
                            {r.jersey_number}
                          </span>
                        )}
                      </span>
                      <span className="truncate flex-1">{name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function BenchPlayerCard({
  row,
  stat,
  disabled,
  canSubFreely,
  onSubIn,
}: {
  row: RosterRow;
  stat: MatchPlayerStat | undefined;
  disabled: boolean;
  canSubFreely: boolean;
  onSubIn: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card/60 p-2.5 flex items-center gap-2.5 transition-all hover:shadow-sm">
      <div className="relative shrink-0 h-9 w-9">
        {row.player?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.player.photo_url}
            alt={row.player.display_name || row.player.full_name || ""}
            className="h-full w-full rounded-full object-cover border"
          />
        ) : (
          <div className="h-full w-full grid place-items-center rounded-full bg-muted text-muted-foreground font-mono text-sm font-bold">
            {row.jersey_number ?? "—"}
          </div>
        )}
        {row.player?.photo_url && row.jersey_number && (
          <span className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground font-mono text-[10px] font-bold leading-none grid place-items-center border border-background">
            {row.jersey_number}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-sm">
          {row.player?.display_name || row.player?.full_name || "—"}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
          {row.jersey_number && (
            <span className="font-mono font-bold text-foreground">
              #{row.jersey_number}
            </span>
          )}
          {row.jersey_number && <span>·</span>}
          <span className="font-mono font-bold text-foreground">
            {stat?.points ?? 0}
          </span>
          <span>pts</span>
          <span>·</span>
          <span className="font-mono font-bold text-foreground">
            {stat?.fouls ?? 0}
          </span>
          <span>f</span>
        </div>
      </div>
      <Button
        size="sm"
        variant={canSubFreely ? "default" : "outline"}
        onClick={onSubIn}
        disabled={disabled}
        className="gap-1 shrink-0"
      >
        <ArrowUpFromLine className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">In</span>
      </Button>
    </div>
  );
}

function TimeoutPanel({
  homeTeam,
  awayTeam,
  disabled,
  onPauseMatch,
}: {
  homeTeam: Team;
  awayTeam: Team;
  disabled: boolean;
  onPauseMatch: () => Promise<void>;
}) {
  const MAX_TIMEOUTS = 6;
  const toast = useToast();
  const [counts, setCounts] = useState<{ home: number; away: number }>({
    home: 0,
    away: 0,
  });
  // Brief flash so the scorer can tell their tap registered.
  const [justCalled, setJustCalled] = useState<"home" | "away" | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(side: "home" | "away") {
    setJustCalled(side);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setJustCalled(null), 1400);
  }

  useEffect(() => {
    return () => {
      if (flashRef.current) clearTimeout(flashRef.current);
    };
  }, []);

  async function callTimeout(side: "home" | "away") {
    if (disabled) return;
    if (counts[side] >= MAX_TIMEOUTS) return;
    await onPauseMatch();
    setCounts((c) => ({ ...c, [side]: c[side] + 1 }));
    flash(side);
    const teamName = (side === "home" ? homeTeam : awayTeam).short_name;
    toast.push(`Time out called for ${teamName}.`, "success");
  }

  function undoTimeout(side: "home" | "away") {
    setCounts((c) => {
      if (c[side] <= 0) return c;
      return { ...c, [side]: c[side] - 1 };
    });
    const teamName = (side === "home" ? homeTeam : awayTeam).short_name;
    toast.push(`Time out reverted for ${teamName}.`, "default");
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border/40 shadow-lg">
      {/* Center label badge — overlays the split point */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
        <div className="grid place-items-center h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-background border-2 border-border/70 shadow-md">
          <span className="font-display font-black text-2xl sm:text-3xl tracking-tighter text-foreground leading-none">
            T
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border/40">
        <TimeoutSide
          team={homeTeam}
          accent="home"
          align="left"
          used={counts.home}
          max={MAX_TIMEOUTS}
          disabled={disabled}
          justCalled={justCalled === "home"}
          onCall={() => callTimeout("home")}
          onUndo={() => undoTimeout("home")}
        />
        <TimeoutSide
          team={awayTeam}
          accent="away"
          align="right"
          used={counts.away}
          max={MAX_TIMEOUTS}
          disabled={disabled}
          justCalled={justCalled === "away"}
          onCall={() => callTimeout("away")}
          onUndo={() => undoTimeout("away")}
        />
      </div>
    </div>
  );
}

function TimeoutSide({
  team,
  accent,
  align,
  used,
  max,
  disabled,
  justCalled,
  onCall,
  onUndo,
}: {
  team: Team;
  accent: "home" | "away";
  align: "left" | "right";
  used: number;
  max: number;
  disabled: boolean;
  justCalled: boolean;
  onCall: () => void;
  onUndo: () => void;
}) {
  const exhausted = used >= max;
  const bg =
    accent === "home"
      ? "bg-gradient-to-br from-primary/20 via-primary/10 to-transparent hover:from-primary/30 hover:via-primary/15"
      : "bg-gradient-to-bl from-blue-500/20 via-blue-500/10 to-transparent hover:from-blue-500/30 hover:via-blue-500/15";
  const dotOn = accent === "home" ? "bg-primary" : "bg-blue-500";
  const dotOff = "bg-foreground/15";
  const labelText =
    accent === "home" ? "text-primary" : "text-blue-500";
  const ringFlash =
    accent === "home"
      ? "ring-primary/70 bg-primary/30"
      : "ring-blue-500/70 bg-blue-500/30";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onCall}
        disabled={disabled || exhausted}
        aria-label={`Call timeout for ${team.name}`}
        className={cn(
          "group relative w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-5 sm:py-6 transition-colors text-left overflow-hidden",
          align === "right" && "flex-row-reverse text-right",
          bg,
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {/* Team-logo watermark, centered behind the content. Falls back to a
            big "TO" if the team has no uploaded logo. */}
        {team.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.logo_url}
            alt=""
            aria-hidden
            className={cn(
              "absolute inset-0 m-auto pointer-events-none select-none object-contain",
              "h-[110%] w-auto max-w-[80%]",
              "blur-[1px] sm:blur-[1.5px]",
              justCalled ? "opacity-90 blur-[0.5px]" : "opacity-60",
              "transition-all",
            )}
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center font-display font-black text-[88px] sm:text-[120px] leading-none select-none pointer-events-none opacity-[0.07] tracking-tighter"
          >
            TO
          </span>
        )}

        {/* Click feedback flash overlay */}
        {justCalled && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 ring-4 ring-inset rounded-none animate-pulse pointer-events-none",
              ringFlash,
            )}
          />
        )}

        <div
          className={cn(
            "relative z-10 min-w-0 flex-1 flex flex-col gap-1",
            align === "right" && "items-end",
          )}
        >
          <span className={cn("label-caps", labelText)}>
            {team.short_name}
          </span>
          <span className="font-display text-lg sm:text-2xl font-black uppercase tracking-tight leading-tight">
            {justCalled
              ? "Time out called!"
              : exhausted
              ? "Out of timeouts"
              : "Call time out"}
          </span>
          {/* Usage dots */}
          <div
            className={cn(
              "flex items-center gap-1 mt-1.5",
              align === "right" && "flex-row-reverse",
            )}
          >
            {Array.from({ length: max }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  i < used ? dotOn : dotOff,
                )}
              />
            ))}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono ml-1">
              {used}/{max}
            </span>
          </div>
        </div>
      </button>

      {/* Undo / decrement chip — sits in the outer corner of the side. */}
      {used > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUndo();
          }}
          aria-label={`Undo last timeout for ${team.name}`}
          title="Undo last time out"
          className={cn(
            "absolute top-2 z-20 inline-flex items-center justify-center h-7 w-7 rounded-full border bg-background/90 text-foreground hover:bg-background transition-colors shadow-sm",
            align === "left" ? "right-2" : "left-2",
          )}
        >
          <span className="font-display font-black leading-none text-base">
            −
          </span>
        </button>
      )}
    </div>
  );
}

function TeamLogoBadge({
  team,
  size,
  accentChipClass,
}: {
  team: Team;
  size: number;
  accentChipClass?: string;
}) {
  const dim = { width: size, height: size };
  if (team.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logo_url}
        alt={team.name}
        style={dim}
        className="rounded-md object-contain border bg-background/60 shrink-0"
      />
    );
  }
  return (
    <div
      style={dim}
      className={cn(
        "rounded-md border grid place-items-center font-display font-bold uppercase tracking-wider shrink-0",
        accentChipClass ?? "bg-muted/60 text-muted-foreground",
      )}
    >
      <span style={{ fontSize: Math.max(10, Math.round(size / 3)) }}>
        {team.short_name?.slice(0, 3) ?? "—"}
      </span>
    </div>
  );
}
