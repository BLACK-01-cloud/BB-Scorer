import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/chrome/page-header";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Row = Match & {
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  season: { name: string } | null;
};

export default async function ScorerMatchesPage() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("matches")
    .select(
      "*, home_team:home_team_id(name), away_team:away_team_id(name), season:season_id(name)",
    )
    .in("match_status", ["scheduled", "live", "paused"])
    .order("match_date", { ascending: true });

  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scorer · Console"
        title="Pick a match to score"
        description="Live and upcoming fixtures the scorer console can drive."
      />

      <div className="arena-glass rounded-2xl p-1">
        {error ? (
          <p className="p-6 text-sm text-destructive">{error.message}</p>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No upcoming or live matches.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-4 hover:bg-foreground/[0.02] transition-colors"
              >
                <div className="text-xs label-caps text-primary whitespace-nowrap min-w-[6rem]">
                  {formatDateTime(m.match_date)}
                </div>
                <div className="font-display text-base font-semibold">
                  {m.home_team?.name ?? "?"}
                  <span className="text-muted-foreground"> vs </span>
                  {m.away_team?.name ?? "?"}
                  <div className="text-xs text-muted-foreground font-sans font-normal mt-0.5">
                    {m.season?.name ?? "—"}
                  </div>
                </div>
                <div>
                  <Badge variant={m.match_status === "live" ? "live" : "outline"}>
                    {m.match_status}
                  </Badge>
                </div>
                <Link
                  href={`/scorer/match/${m.id}`}
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "justify-self-end",
                  )}
                >
                  Score
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
