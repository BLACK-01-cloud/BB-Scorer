import Link from "next/link";
import {
  Users,
  User as UserIcon,
  CalendarDays,
  Activity,
  Plus,
  Trophy,
  Shield,
  Settings as SettingsIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
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
      "id, match_date, match_status, home_score, away_score, current_period, time_remaining_seconds, home_team:home_team_id(name, short_name), away_team:away_team_id(name, short_name)",
    )
    .eq("match_status", "live")
    .order("match_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentMatches } = await supabase
    .from("matches")
    .select(
      "id, match_date, match_status, home_score, away_score, home_team:home_team_id(name), away_team:away_team_id(name)",
    )
    .order("match_date", { ascending: false })
    .limit(8);

  return (
    <div className="space-y-8">
      {/* Bento stat tiles */}
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
        />
        <StatTile
          label="Live now"
          value={live}
          Icon={Activity}
          href="/admin/matches?status=live"
          accent
        />
      </section>

      {/* Spotlight + management */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 arena-glass rounded-2xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1 rounded-full bg-primary text-primary-foreground">
            <span className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
            <span className="label-caps">
              {liveMatch ? "Live now" : "No live match"}
            </span>
          </div>

          <div className="label-caps text-muted-foreground">Spotlight</div>

          {liveMatch ? (
            <Link href={`/live/match/${liveMatch.id}`} className="block">
              <div className="mt-6 grid grid-cols-3 items-center gap-3">
                <div className="text-center sm:text-right">
                  <div className="font-display text-lg sm:text-xl font-bold uppercase tracking-tight">
                    {(liveMatch as any).home_team?.short_name ??
                      (liveMatch as any).home_team?.name}
                  </div>
                  <div className="font-display text-5xl sm:text-7xl font-bold text-primary score-glow scoreboard-digit mt-1">
                    {liveMatch.home_score}
                  </div>
                </div>
                <div className="text-center label-caps text-muted-foreground">
                  Q{liveMatch.current_period}
                </div>
                <div className="text-center sm:text-left">
                  <div className="font-display text-lg sm:text-xl font-bold uppercase tracking-tight">
                    {(liveMatch as any).away_team?.short_name ??
                      (liveMatch as any).away_team?.name}
                  </div>
                  <div className="font-display text-5xl sm:text-7xl font-bold text-primary score-glow scoreboard-digit mt-1">
                    {liveMatch.away_score}
                  </div>
                </div>
              </div>
              <div className="mt-6 text-center">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
                  Open public scoreboard
                </span>
              </div>
            </Link>
          ) : (
            <div className="mt-10 mb-4 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                No matches are live right now. Start the clock from{" "}
                <Link
                  href="/admin/matches"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Matches
                </Link>{" "}
                to spotlight one here.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Management</h2>
          <p className="text-sm text-muted-foreground -mt-2">
            Quickly update the league roster and schedule.
          </p>
          <ManageAction
            href="/admin/teams"
            label="Teams"
            sub="Add or edit clubs"
            Icon={Shield}
          />
          <ManageAction
            href="/admin/matches"
            label="Create match"
            sub="Schedule a fixture"
            Icon={Plus}
          />
          <ManageAction
            href="/admin/settings"
            label="Branding"
            sub="Logo & site name"
            Icon={SettingsIcon}
          />
        </div>
      </section>

      {/* Recent activity */}
      <section className="arena-glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold">
            Recent activity
          </h2>
          <Link
            href="/admin/matches"
            className="label-caps text-primary hover:text-primary/80"
          >
            View all
          </Link>
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
                        <Link
                          href={`/live/match/${m.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {home?.name} vs {away?.name}
                        </Link>
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
        <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Completed: {completed}</span>
          <span>•</span>
          <span>Upcoming: {upcoming}</span>
          <span>•</span>
          <span>Total: {totalMatches}</span>
        </div>
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  Icon,
  href,
  accent = false,
}: {
  label: string;
  value: number;
  Icon: typeof Users;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xl p-5 sm:p-6 flex flex-col justify-between transition-colors min-h-[120px]",
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
        <Icon className={cn("h-5 w-5", accent ? "text-primary" : "text-primary")} />
      </div>
      <div
        className={cn(
          "font-display font-bold text-3xl sm:text-4xl scoreboard-digit relative z-10",
          accent ? "text-primary score-glow" : "text-foreground",
        )}
      >
        {String(value).padStart(2, "0")}
      </div>
    </Link>
  );
}

function ManageAction({
  href,
  label,
  sub,
  Icon,
}: {
  href: string;
  label: string;
  sub: string;
  Icon: typeof Plus;
}) {
  return (
    <Link
      href={href}
      className="block arena-glass rounded-xl p-4 transition-colors hover:border-primary/40 group"
    >
      <div className="flex items-center gap-3">
        <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/15 text-primary group-hover:bg-primary/25 transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-display font-semibold">{label}</div>
          <div className="text-xs text-muted-foreground truncate">{sub}</div>
        </div>
      </div>
    </Link>
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
