"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import type { TeamPlayer } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

type SeasonOpt = { id: string; name: string; is_active: boolean; start_date: string };
type TeamOpt = { id: string; name: string; short_name: string; logo_url?: string | null };
type PlayerOpt = { id: string; full_name: string; display_name: string | null };

type Row = TeamPlayer & {
  player: PlayerOpt | null;
  team: TeamOpt | null;
};

type FormState = {
  team_id: string;
  player_id: string;
  jersey_number: string;
  active: boolean;
};

const empty: FormState = {
  team_id: "",
  player_id: "",
  jersey_number: "",
  active: true,
};

export default function TeamPlayersManager({
  seasons,
  teams,
  players,
}: {
  seasons: SeasonOpt[];
  teams: TeamOpt[];
  players: PlayerOpt[];
}) {
  const toast = useToast();
  const supabase = createClient();

  const initialSeason =
    seasons.find((s) => s.is_active)?.id ?? seasons[0]?.id ?? "";
  const [seasonId, setSeasonId] = useState(initialSeason);
  const [teamFilter, setTeamFilter] = useState("all");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const playerIndex = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, p])),
    [players],
  );
  const teamIndex = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, t])),
    [teams],
  );

  // Players already actively assigned in the selected season — hidden from the
  // assign modal so we don't violate the "one active per (season, player)"
  // unique index. When editing, allow the row's own player to stay visible so
  // the dropdown still shows the current selection.
  const assignedPlayerIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.active) s.add(r.player_id);
    }
    return s;
  }, [rows]);

  const availablePlayers = useMemo(() => {
    return players.filter(
      (p) =>
        !assignedPlayerIds.has(p.id) || (editing && editing.player_id === p.id),
    );
  }, [players, assignedPlayerIds, editing]);

  useEffect(() => {
    if (!seasonId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("team_players")
        .select("*")
        .eq("season_id", seasonId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.push(error.message, "error");
        setRows([]);
        return;
      }
      const expanded: Row[] = (data ?? []).map((r) => ({
        ...r,
        player: playerIndex[r.player_id] ?? null,
        team: teamIndex[r.team_id] ?? null,
      }));
      setRows(expanded);
    })();
    return () => {
      cancelled = true;
    };
  }, [seasonId, supabase, toast, playerIndex, teamIndex]);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(r: Row) {
    setEditing(r);
    setForm({
      team_id: r.team_id,
      player_id: r.player_id,
      jersey_number: r.jersey_number ?? "",
      active: r.active,
    });
    setOpen(true);
  }

  async function onSave() {
    if (!seasonId) return;
    if (!form.team_id || !form.player_id) {
      toast.push("Team and player are required.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        season_id: seasonId,
        team_id: form.team_id,
        player_id: form.player_id,
        jersey_number: form.jersey_number.trim() || null,
        active: form.active,
      };
      if (editing) {
        const { data, error } = await supabase
          .from("team_players")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        setRows((prev) =>
          prev.map((x) =>
            x.id === data.id
              ? {
                  ...data,
                  player: playerIndex[data.player_id] ?? null,
                  team: teamIndex[data.team_id] ?? null,
                }
              : x,
          ),
        );
        toast.push("Assignment updated.", "success");
      } else {
        const { data, error } = await supabase
          .from("team_players")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setRows((prev) => [
          {
            ...data,
            player: playerIndex[data.player_id] ?? null,
            team: teamIndex[data.team_id] ?? null,
          },
          ...prev,
        ]);
        toast.push("Player assigned.", "success");
      }
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      if (msg.includes("team_players_one_active_per_season")) {
        toast.push(
          "This player already has an active assignment in this season. Disable it first.",
          "error",
        );
      } else if (msg.includes("team_players_unique_jersey")) {
        toast.push(
          "Jersey number is already used by another active player on this team.",
          "error",
        );
      } else {
        toast.push(msg, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(r: Row) {
    if (!confirm("Remove this assignment?")) return;
    const { error } = await supabase
      .from("team_players")
      .delete()
      .eq("id", r.id);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  }

  async function toggleActive(r: Row) {
    const { error } = await supabase
      .from("team_players")
      .update({ active: !r.active })
      .eq("id", r.id);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    setRows((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)),
    );
  }

  const visible = rows.filter(
    (r) => teamFilter === "all" || r.team_id === teamFilter,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Season</Label>
          <Select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
          >
            {seasons.length === 0 ? (
              <option value="">No seasons</option>
            ) : (
              seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_active ? " (active)" : ""}
                </option>
              ))
            )}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Team filter</Label>
          <Select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end justify-end">
          <Button onClick={openCreate} disabled={!seasonId}>
            + Assign player
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : !seasonId ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Create a season first.
            </p>
          ) : visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No assignments yet for this filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {r.team?.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.team.logo_url}
                            alt=""
                            className="h-7 w-7 rounded object-cover border shrink-0"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded bg-muted/40 border grid place-items-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                            {r.team?.short_name?.slice(0, 3) ?? "—"}
                          </div>
                        )}
                        <span className="truncate">{r.team?.name ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.player?.display_name || r.player?.full_name || "—"}
                    </TableCell>
                    <TableCell>{r.jersey_number ?? "—"}</TableCell>
                    <TableCell>
                      <button onClick={() => toggleActive(r)} type="button">
                        {r.active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(r)}
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
              {editing ? "Edit assignment" : "Assign player"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Team</Label>
              <SearchableSelect
                value={form.team_id}
                onChange={(id) => setForm({ ...form, team_id: id })}
                options={teams.map((t) => ({
                  id: t.id,
                  label: t.name,
                  hint: t.short_name,
                  searchable: `${t.name} ${t.short_name}`,
                }))}
                placeholder="— select team —"
                searchPlaceholder="Search team name or short code…"
              />
            </div>
            <div className="space-y-2">
              <Label>Player</Label>
              <SearchableSelect
                value={form.player_id}
                onChange={(id) => setForm({ ...form, player_id: id })}
                options={availablePlayers.map((p) => ({
                  id: p.id,
                  label: p.display_name || p.full_name,
                  hint: p.display_name && p.display_name !== p.full_name ? p.full_name : undefined,
                  searchable: `${p.full_name} ${p.display_name ?? ""}`,
                }))}
                placeholder="— select player —"
                searchPlaceholder="Search player name…"
              />
              {availablePlayers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Every player is already actively assigned in this season.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Jersey #</Label>
              <Input
                value={form.jersey_number}
                onChange={(e) =>
                  setForm({ ...form, jersey_number: e.target.value })
                }
                placeholder="23"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.checked })
                }
              />
              Active assignment
            </label>
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

type SearchOption = {
  id: string;
  label: string;
  hint?: string;
  searchable: string;
};

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
}: {
  value: string;
  onChange: (id: string) => void;
  options: SearchOption[];
  placeholder: string;
  searchPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.searchable.toLowerCase().includes(q));
  }, [options, query]);

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
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "w-full flex items-center justify-between gap-2 h-10 rounded-md border border-input bg-background px-3 text-sm text-left",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
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
                placeholder={searchPlaceholder}
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-60 overflow-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground italic">
                No options available
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground italic">
                No matches for &quot;{query}&quot;.
              </li>
            ) : (
              filtered.map((o) => {
                const isSelected = o.id === value;
                return (
                  <li key={o.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => pick(o.id)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left",
                        "hover:bg-accent hover:text-accent-foreground",
                        isSelected && "bg-accent/60",
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.hint && (
                        <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
                          {o.hint}
                        </span>
                      )}
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
