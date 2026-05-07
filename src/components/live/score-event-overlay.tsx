"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

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
  homeScore: number;
  awayScore: number;
  homeShortName: string;
  awayShortName: string;
};

const VISIBLE_MS = 3500;
const LEAVE_MS = 320;

const ACTION_LABEL: Record<1 | 2 | 3, string> = {
  1: "1PT MADE",
  2: "2PT MADE",
  3: "3PT MADE",
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

  const isHomeScorer = current.teamAccent === "home";
  const accentTextClass = isHomeScorer ? "text-primary" : "text-sky-400";
  const accentBorderClass = isHomeScorer
    ? "border-primary/55"
    : "border-sky-400/55";
  const accentBgClass = isHomeScorer ? "bg-primary" : "bg-sky-500";
  const accentFgClass = isHomeScorer
    ? "text-primary-foreground"
    : "text-white";

  const initial = (current.playerName.trim()[0] ?? "?").toUpperCase();
  const periodLabel =
    typeof current.period === "number" ? `Q${current.period}` : null;

  const homeScoreClass = isHomeScorer
    ? accentTextClass
    : "text-foreground/70";
  const awayScoreClass = !isHomeScorer
    ? accentTextClass
    : "text-foreground/70";
  const homeNameClass = isHomeScorer
    ? accentTextClass
    : "text-muted-foreground";
  const awayNameClass = !isHomeScorer
    ? accentTextClass
    : "text-muted-foreground";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 md:bottom-12 z-[90] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={
          "pointer-events-auto relative w-[min(calc(100vw-2rem),34rem)] overflow-hidden rounded-2xl border border-border/40 bg-background/85 backdrop-blur-xl " +
          "score-popup-glow score-popup-sweep " +
          (animState === "in" ? "score-popup-enter" : "score-popup-leave")
        }
      >
        <div className="relative z-10 flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
        {/* Left: Avatar + team badge */}
        <div className="relative shrink-0">
          <div
            className={
              "h-14 w-14 sm:h-16 sm:w-16 overflow-hidden rounded-full border-2 bg-muted/30 " +
              accentBorderClass
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
                  "grid h-full w-full place-items-center font-display text-xl font-black " +
                  accentTextClass
                }
              >
                {initial}
              </div>
            )}
          </div>

          <div
            className={
              "absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center overflow-hidden rounded-full border bg-card shadow-lg " +
              accentBorderClass
            }
            aria-hidden
          >
            {current.teamLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={current.teamLogoUrl}
                alt=""
                className="h-full w-full object-contain p-0.5"
              />
            ) : (
              <Star
                className={"h-4 w-4 fill-current " + accentTextClass}
                aria-hidden
              />
            )}
          </div>
        </div>

        {/* Center: Event info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={
                "font-display text-sm sm:text-base font-bold uppercase tracking-wider " +
                accentTextClass
              }
            >
              {ACTION_LABEL[current.pointsScored]}
            </span>
            <span
              className="h-2 w-2 rounded-full bg-red-500 animate-pulse"
              aria-hidden
            />
          </div>

          <div className="mt-0.5 truncate font-display text-base sm:text-lg font-bold text-foreground scoreboard-digit">
            {current.jerseyNumber && (
              <span className="font-mono text-muted-foreground/90">
                #{current.jerseyNumber}{" "}
              </span>
            )}
            {current.playerName}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="font-display font-bold">
              {current.teamShortName}
            </span>
            {periodLabel && (
              <>
                <span
                  className="h-1 w-1 rounded-full bg-muted-foreground/60"
                  aria-hidden
                />
                <span className="font-mono">{periodLabel}</span>
              </>
            )}
            {current.matchClock && (
              <>
                <span
                  className="h-1 w-1 rounded-full bg-muted-foreground/60"
                  aria-hidden
                />
                <span className="font-mono scoreboard-digit">
                  {current.matchClock}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: +N pill + scoreboard line */}
        <div className="flex shrink-0 flex-col items-end gap-1.5 pr-1">
          <div
            className={
              "score-points-pop rounded-full px-2.5 py-0.5 font-display text-xs font-black shadow-md " +
              accentBgClass +
              " " +
              accentFgClass
            }
          >
            +{current.pointsScored}
          </div>

          <div className="flex items-baseline gap-1.5">
            <span
              className={
                "font-display text-[10px] font-bold uppercase tracking-widest " +
                homeNameClass
              }
            >
              {current.homeShortName}
            </span>
            <span
              className={
                "font-display text-lg sm:text-xl font-bold scoreboard-digit " +
                homeScoreClass
              }
            >
              {current.homeScore}
            </span>
            <span className="text-muted-foreground/40" aria-hidden>
              –
            </span>
            <span
              className={
                "font-display text-lg sm:text-xl font-bold scoreboard-digit " +
                awayScoreClass
              }
            >
              {current.awayScore}
            </span>
            <span
              className={
                "font-display text-[10px] font-bold uppercase tracking-widest " +
                awayNameClass
              }
            >
              {current.awayShortName}
            </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
