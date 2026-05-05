"use client";

import { useEffect, useMemo, useState } from "react";
import type { TeamPlayer } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/client";
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
type TeamOpt = { id: string; name: string; short_name: string };
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
                      {r.team?.name ?? "—"}
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
              <Select
                value={form.team_id}
                onChange={(e) => setForm({ ...form, team_id: e.target.value })}
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
              <Label>Player</Label>
              <Select
                value={form.player_id}
                onChange={(e) =>
                  setForm({ ...form, player_id: e.target.value })
                }
              >
                <option value="">— select —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || p.full_name}
                  </option>
                ))}
              </Select>
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
