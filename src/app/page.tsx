import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TopAppBar } from "@/components/chrome/top-app-bar";
import { BottomNav, BottomNavSpacer } from "@/components/chrome/bottom-nav";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createClient();
  const [{ data: liveMatches }, { data: upcoming }] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, match_date, match_status, home_score, away_score, current_period, time_remaining_seconds, home_team:home_team_id(name, short_name), away_team:away_team_id(name, short_name)",
      )
      .eq("match_status", "live")
      .order("match_date", { ascending: true })
      .limit(10),
    supabase
      .from("matches")
      .select(
        "id, match_date, match_status, home_team:home_team_id(name, short_name), away_team:away_team_id(name, short_name)",
      )
      .eq("match_status", "scheduled")
      .gte("match_date", new Date().toISOString())
      .order("match_date", { ascending: true })
      .limit(10),
  ]);

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Background texture
          - Light theme: vivid arena image (full color, contrast boost)
          - Dark theme:  muted cinematic (lower opacity, slight color, brightness lift) */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-75 saturate-125 contrast-100 dark:opacity-60 dark:saturate-110 dark:brightness-125 dark:contrast-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/arena-bg.jpg"
          alt=""
          aria-hidden
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/10 to-background/40 dark:from-background/60 dark:via-background/15 dark:to-background/60" />
      </div>

      <div className="relative z-10">
        <TopAppBar
          active="live"
          rightSlot={
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Sign in
            </Link>
          }
        />

        <section className="container py-10 md:py-14 px-4 md:px-8">
          <div className="mb-10 max-w-2xl">
            <span className="label-caps text-primary">Live · Public</span>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-2">
              Live Basketball Scores
            </h1>
            <p className="text-muted-foreground mt-3 text-base">
              Follow your club&apos;s matches in real time. No login required.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Now playing" badge={<Badge variant="live">LIVE</Badge>}>
              {!liveMatches || liveMatches.length === 0 ? (
                <EmptyTile message="No matches are live right now." />
              ) : (
                <div className="space-y-3">
                  {liveMatches.map((m) => {
                    const home = (m as any).home_team;
                    const away = (m as any).away_team;
                    return (
                      <MatchCard
                        key={m.id}
                        href={`/live/match/${m.id}`}
                        eyebrow={`Quarter ${m.current_period}`}
                        eyebrowAccent="primary"
                        homeName={home?.name}
                        homeShort={home?.short_name}
                        awayName={away?.name}
                        awayShort={away?.short_name}
                        center={`${m.home_score} - ${m.away_score}`}
                        centerStyle="score"
                        rightBadge={<Badge variant="live">LIVE</Badge>}
                      />
                    );
                  })}
                </div>
              )}
            </Section>

            <Section title="Upcoming">
              {!upcoming || upcoming.length === 0 ? (
                <EmptyTile message="No upcoming matches scheduled." />
              ) : (
                <div className="space-y-3">
                  {upcoming.map((m) => {
                    const home = (m as any).home_team;
                    const away = (m as any).away_team;
                    return (
                      <MatchCard
                        key={m.id}
                        href={`/live/match/${m.id}`}
                        eyebrow={formatDateTime(m.match_date)}
                        eyebrowAccent="muted"
                        homeName={home?.name}
                        homeShort={home?.short_name}
                        awayName={away?.name}
                        awayShort={away?.short_name}
                        center="vs"
                        centerStyle="vs"
                        rightBadge={
                          <Badge variant="outline" className="font-mono text-[10px]">
                            SCHEDULED
                          </Badge>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        </section>

        <BottomNavSpacer />
      </div>
      <BottomNav />
    </main>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
        {badge}
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyTile({ message }: { message: string }) {
  return (
    <div className="arena-glass rounded-xl py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function MatchCard({
  href,
  eyebrow,
  eyebrowAccent,
  homeName,
  homeShort,
  awayName,
  awayShort,
  center,
  centerStyle,
  rightBadge,
}: {
  href: string;
  eyebrow: string;
  eyebrowAccent: "primary" | "muted";
  homeName?: string;
  homeShort?: string;
  awayName?: string;
  awayShort?: string;
  center: string;
  centerStyle: "score" | "vs";
  rightBadge?: React.ReactNode;
}) {
  return (
    <Link href={href} className="block group">
      <div className="arena-glass rounded-xl p-4 h-[112px] flex flex-col justify-between transition-colors hover:border-primary/50">
        {/* Top row — eyebrow + status badge */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "label-caps truncate",
              eyebrowAccent === "primary" ? "text-primary" : "text-muted-foreground",
            )}
          >
            {eyebrow}
          </span>
          {rightBadge}
        </div>

        {/* Bottom row — home / center / away in equal columns */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0 text-left">
            <div className="font-display font-bold text-base sm:text-lg truncate">
              {homeName ?? "—"}
            </div>
            {homeShort && (
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {homeShort}
              </div>
            )}
          </div>
          <div
            className={cn(
              "font-display font-bold scoreboard-digit shrink-0 px-2",
              centerStyle === "score"
                ? "text-2xl sm:text-3xl text-primary score-glow"
                : "text-sm uppercase tracking-widest text-muted-foreground/70",
            )}
          >
            {center}
          </div>
          <div className="min-w-0 text-right">
            <div className="font-display font-bold text-base sm:text-lg truncate">
              {awayName ?? "—"}
            </div>
            {awayShort && (
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {awayShort}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
