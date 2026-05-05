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
      {/* Subtle background texture */}
      <div className="fixed inset-0 z-0 opacity-15 grayscale pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/arena-bg.jpg"
          alt=""
          aria-hidden
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
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
                      <Link
                        key={m.id}
                        href={`/live/match/${m.id}`}
                        className="block group"
                      >
                        <div className="arena-glass rounded-xl p-4 flex items-center justify-between gap-4 transition-colors hover:border-primary/40">
                          <div className="min-w-0">
                            <div className="label-caps text-primary mb-1">
                              Quarter {m.current_period}
                            </div>
                            <div className="font-display font-semibold text-lg truncate">
                              {home?.name} vs {away?.name}
                            </div>
                          </div>
                          <div className="font-display text-3xl font-bold text-primary score-glow scoreboard-digit shrink-0">
                            {m.home_score} - {m.away_score}
                          </div>
                        </div>
                      </Link>
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
                      <Link
                        key={m.id}
                        href={`/live/match/${m.id}`}
                        className="block"
                      >
                        <div className="arena-glass rounded-xl p-4 transition-colors hover:border-primary/40">
                          <div className="label-caps text-muted-foreground mb-1">
                            {formatDateTime(m.match_date)}
                          </div>
                          <div className="font-display font-semibold text-lg truncate">
                            {home?.name} vs {away?.name}
                          </div>
                        </div>
                      </Link>
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
