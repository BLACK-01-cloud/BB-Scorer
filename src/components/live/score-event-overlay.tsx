"use client";

import { useEffect, useRef, useState } from "react";

export type ScoreEvent = {
  id: string;
  playerName: string;
  jerseyNumber: string | null;
  photoUrl: string | null;
  position: string | null;
  teamName: string;
  teamShortName: string;
  teamLogoUrl: string | null;
  teamAccent: "home" | "away";
  pointsScored: 1 | 2 | 3;
  totalPoints: number;
  matchClock?: string;
  period?: number;
};

const VISIBLE_MS = 3500;
const LEAVE_MS = 320;

const SHOT_INFO: Record<
  1 | 2 | 3,
  { chant: string; label: string; sublabel: string }
> = {
  1: {
    chant: "At the Line",
    label: "Free Throw",
    sublabel: "Charity Stripe",
  },
  2: {
    chant: "Scores!",
    label: "Bucket",
    sublabel: "Field Goal",
  },
  3: {
    chant: "Bang! From Downtown",
    label: "Triple",
    sublabel: "Beyond the Arc",
  },
};

export function ScoreEventOverlay({ events }: { events: ScoreEvent[] }) {
  const [current, setCurrent] = useState<ScoreEvent | null>(null);
  const [animState, setAnimState] = useState<"in" | "out">("in");
  const queueRef = useRef<ScoreEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    let added = false;
    for (const e of events) {
      if (!seenRef.current.has(e.id)) {
        seenRef.current.add(e.id);
        queueRef.current.push(e);
        added = true;
      }
    }
    if (added && !busyRef.current) showNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) window.clearTimeout(t);
      timersRef.current = [];
    };
  }, []);

  function showNext() {
    const next = queueRef.current.shift();
    if (!next) {
      busyRef.current = false;
      return;
    }
    busyRef.current = true;
    setCurrent(next);
    setAnimState("in");
    const t1 = window.setTimeout(() => {
      setAnimState("out");
      const t2 = window.setTimeout(() => {
        setCurrent(null);
        showNext();
      }, LEAVE_MS);
      timersRef.current.push(t2);
    }, VISIBLE_MS);
    timersRef.current.push(t1);
  }

  if (!current) return null;

  const accentVar =
    current.teamAccent === "home"
      ? "var(--primary)"
      : "210 90% 60%"; /* away = blue */

  const accentTextClass =
    current.teamAccent === "home" ? "text-primary" : "text-sky-400";
  const accentRingClass =
    current.teamAccent === "home"
      ? "ring-primary/40 bg-primary/10"
      : "ring-sky-400/40 bg-sky-400/10";
  const accentBarClass =
    current.teamAccent === "home"
      ? "bg-gradient-to-r from-primary/70 via-primary to-primary/70"
      : "bg-gradient-to-r from-sky-400/70 via-sky-400 to-sky-400/70";

  const initial = (current.playerName.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 md:bottom-12 z-[90] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        style={
          {
            ["--accent-glow" as string]: accentVar,
          } as React.CSSProperties
        }
        className={
          "pointer-events-auto relative w-[min(calc(100vw-2rem),32rem)] overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl " +
          (animState === "in" ? "score-popup-enter" : "score-popup-leave")
        }
      >
        <div className={"h-1 w-full " + accentBarClass} />

        <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          {/* Player avatar */}
          <div className="relative shrink-0">
            <div
              className={
                "h-14 w-14 sm:h-16 sm:w-16 overflow-hidden rounded-full ring-2 " +
                accentRingClass
              }
            >
              {current.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={current.photoUrl}
                  alt={current.playerName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className={
                    "grid h-full w-full place-items-center font-display text-xl font-black uppercase " +
                    accentTextClass
                  }
                >
                  {initial}
                </div>
              )}
            </div>
            {current.jerseyNumber && (
              <span className="absolute -bottom-1 -right-1 grid h-6 min-w-[1.5rem] place-items-center rounded-full border-2 border-card bg-foreground px-1 font-mono text-[11px] font-black leading-none text-background">
                {current.jerseyNumber}
              </span>
            )}
          </div>

          {/* Points + name + action */}
          <div className="min-w-0 flex-1">
            <div className={"label-caps " + accentTextClass}>
              {SHOT_INFO[current.pointsScored].chant}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span
                className={
                  "score-points-pop font-display text-3xl sm:text-4xl font-black leading-none scoreboard-digit " +
                  accentTextClass
                }
              >
                +{current.pointsScored}
              </span>
              <span className="font-display text-sm sm:text-base font-bold uppercase tracking-tight text-foreground">
                {SHOT_INFO[current.pointsScored].label}
              </span>
              <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-muted-foreground">
                · {SHOT_INFO[current.pointsScored].sublabel}
              </span>
            </div>
            <div className="mt-1 truncate font-display text-base sm:text-lg font-bold uppercase tracking-tight text-foreground">
              {current.playerName}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              {current.position && (
                <span className="font-mono">{current.position}</span>
              )}
              {typeof current.period === "number" && (
                <>
                  {current.position && <span aria-hidden>·</span>}
                  <span className="font-mono">Q{current.period}</span>
                </>
              )}
              {current.matchClock && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono scoreboard-digit">
                    {current.matchClock}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span className="font-mono">
                {current.totalPoints} PTS ON THE NIGHT
              </span>
            </div>
          </div>

          {/* Team logo + short name */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-md border border-border/50 bg-background/60">
              {current.teamLogoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={current.teamLogoUrl}
                  alt={current.teamName}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span
                  className={
                    "font-display text-xs font-black uppercase " +
                    accentTextClass
                  }
                >
                  {current.teamShortName.slice(0, 3)}
                </span>
              )}
            </div>
            <span
              className={
                "font-display text-[10px] font-bold uppercase tracking-widest " +
                accentTextClass
              }
            >
              {current.teamShortName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
