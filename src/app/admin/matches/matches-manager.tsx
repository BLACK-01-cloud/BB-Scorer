"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Match,
  MatchStatus,
  MatchType,
} from "@/lib/types/database";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { LoadingLink } from "@/components/loading-link";
import { cn, formatDateTime, toDatetimeLocal } from "@/lib/utils";

type SeasonOpt = {
  id: string;
  name: string;
  is_active: boolean;
  start_date: string;
};
type TeamOpt = { id: string; name: string; short_name: string };

type Row = Match & {
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  season: { name: string } | null;
};

type FormState = {
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  match_type: MatchType;
  match_status: MatchStatus;
  match_date: string;
  venue: string;
};

function emptyForm(seasons: SeasonOpt[]): FormState {
  return {
    season_id: seasons.find((s) => s.is_active)?.id ?? seasons[0]?.id ?? "",
    home_team_id: "",
    away_team_id: "",
    match_type: "league",
    match_status: "scheduled",
    match_date: "",
    venue: "",
  };
}

const matchTypes: MatchType[] = [
  "league",
  "playoff",
  "quarter_final",
  "semi_final",
  "final",
];
const matchStatuses: MatchStatus[] = [
  "scheduled",
  "live",
  "paused",
  "completed",
  "cancelled",
];

export default function MatchesManager({
  initial,
  seasons,
  teams,
  loadError,
  statusFilter,
}: {
  initial: Row[];
  seasons: SeasonOpt[];
  teams: TeamOpt[];
  loadError: string | null;
  statusFilter: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  const [matches, setMatches] = useState<Row[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(seasons));
  const [saving, setSaving] = useState(false);

  // When the URL `?status=` changes, the server re-fetches and passes a new
  // `initial` prop. `useState(initial)` only consumes `initial` on first
  // mount, so without this sync the filter chips wouldn't update the table.
  useEffect(() => {
    setMatches(initial);
  }, [initial]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(seasons));
    setOpen(true);
  }
  function openEdit(m: Row) {
    setEditing(m);
    setForm({
      season_id: m.season_id,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      match_type: m.match_type,
      match_status: m.match_status,
      match_date: toDatetimeLocal(m.match_date),
      venue: m.venue ?? "",
    });
    setOpen(true);
  }

  async function onSave() {
    if (!form.season_id) {
      toast.push("Pick a season.", "error");
      return;
    }
    if (!form.home_team_id || !form.away_team_id) {
      toast.push("Pick both teams.", "error");
      return;
    }
    if (form.home_team_id === form.away_team_id) {
      toast.push("Home and away cannot be the same team.", "error");
      return;
    }
    if (!form.match_date) {
      toast.push("Pick a match date.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        season_id: form.season_id,
        home_team_id: form.home_team_id,
        away_team_id: form.away_team_id,
        match_type: form.match_type,
        match_status: form.match_status,
        match_date: new Date(form.match_date).toISOString(),
        venue: form.venue.trim() || null,
      };
      if (editing) {
        const { data, error } = await supabase
          .from("matches")
          .update(payload)
          .eq("id", editing.id)
          .select(
            "*, home_team:home_team_id(name), away_team:away_team_id(name), season:season_id(name)",
          )
          .single();
        if (error) throw error;
        setMatches((prev) =>
          prev.map((x) => (x.id === data.id ? (data as Row) : x)),
        );
        toast.push("Match updated.", "success");
      } else {
        const { data, error } = await supabase
          .from("matches")
          .insert(payload)
          .select(
            "*, home_team:home_team_id(name), away_team:away_team_id(name), season:season_id(name)",
          )
          .single();
        if (error) throw error;
        setMatches((prev) => [data as Row, ...prev]);
        toast.push("Match created.", "success");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(m: Row) {
    if (!confirm("Delete this match? Events and stats will be removed too."))
      return;
    const { error } = await supabase.from("matches").delete().eq("id", m.id);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    setMatches((prev) => prev.filter((x) => x.id !== m.id));
    toast.push("Match deleted.", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <FilterLink href="/admin/matches" label="All" active={!statusFilter} />
          {matchStatuses.map((s) => (
            <FilterLink
              key={s}
              href={`/admin/matches?status=${s}`}
              label={s}
              active={statusFilter === s}
            />
          ))}
        </div>
        <Button onClick={openCreate} disabled={seasons.length === 0 || teams.length < 2}>
          + New match
        </Button>
      </div>

      {seasons.length === 0 || teams.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          You need at least one season and two teams to create a match.
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <p className="p-6 text-sm text-destructive">{loadError}</p>
          ) : matches.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No matches.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(m.match_date)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {m.home_team?.name ?? "?"} vs{" "}
                      {m.away_team?.name ?? "?"}
                      <div className="text-xs text-muted-foreground">
                        {m.season?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {m.match_type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.match_status} />
                    </TableCell>
                    <TableCell className="font-mono scoreboard-digit">
                      {m.home_score} - {m.away_score}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end flex-wrap gap-2">
                        <LoadingLink
                          href={`/scorer/match/${m.id}`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "default" }),
                          )}
                        >
                          Score
                        </LoadingLink>
                        <LoadingLink
                          href={`/admin/matches/${m.id}`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" }),
                          )}
                        >
                          Preview
                        </LoadingLink>
                        <Link
                          href={`/live/match/${m.id}`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" }),
                          )}
                          target="_blank"
                        >
                          Public
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(m)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(m)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit match" : "Create match"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Season</Label>
              <Select
                value={form.season_id}
                onChange={(e) => setForm({ ...form, season_id: e.target.value })}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Home team</Label>
                <Select
                  value={form.home_team_id}
                  onChange={(e) =>
                    setForm({ ...form, home_team_id: e.target.value })
                  }
                >
                  <option value="">— select —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Away team</Label>
                <Select
                  value={form.away_team_id}
                  onChange={(e) =>
                    setForm({ ...form, away_team_id: e.target.value })
                  }
                >
                  <option value="">— select —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.match_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      match_type: e.target.value as MatchType,
                    })
                  }
                >
                  {matchTypes.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.match_status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      match_status: e.target.value as MatchStatus,
                    })
                  }
                >
                  {matchStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date &amp; time</Label>
                <Input
                  type="datetime-local"
                  value={form.match_date}
                  onChange={(e) =>
                    setForm({ ...form, match_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Venue</Label>
                <Input
                  value={form.venue}
                  onChange={(e) =>
                    setForm({ ...form, venue: e.target.value })
                  }
                  placeholder="Main arena"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs capitalize",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: MatchStatus }) {
  if (status === "live") return <Badge variant="live">LIVE</Badge>;
  if (status === "completed") return <Badge variant="success">FINAL</Badge>;
  if (status === "paused") return <Badge variant="warn">PAUSED</Badge>;
  if (status === "cancelled")
    return <Badge variant="destructive">CANCELLED</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
