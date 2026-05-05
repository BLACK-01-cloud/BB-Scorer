"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Season } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDate } from "@/lib/utils";

type FormState = {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const empty: FormState = {
  name: "",
  start_date: "",
  end_date: "",
  is_active: false,
};

export default function SeasonsManager({
  initial,
  loadError,
}: {
  initial: Season[];
  loadError: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  const [seasons, setSeasons] = useState<Season[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(s: Season) {
    setEditing(s);
    setForm({
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
      is_active: s.is_active,
    });
    setOpen(true);
  }

  async function onSave() {
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      toast.push("All fields are required.", "error");
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      toast.push("End date must be on or after start date.", "error");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { data, error } = await supabase
          .from("seasons")
          .update(form)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        setSeasons((prev) => prev.map((s) => (s.id === data.id ? data : s)));
        toast.push("Season updated.", "success");
      } else {
        const { data, error } = await supabase
          .from("seasons")
          .insert(form)
          .select()
          .single();
        if (error) throw error;
        setSeasons((prev) => [data, ...prev]);
        toast.push("Season created.", "success");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(s: Season) {
    if (!confirm(`Delete season "${s.name}"?`)) return;
    const { error } = await supabase.from("seasons").delete().eq("id", s.id);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    setSeasons((prev) => prev.filter((x) => x.id !== s.id));
    toast.push("Season deleted.", "success");
    router.refresh();
  }

  async function setActive(s: Season) {
    const { error } = await supabase
      .from("seasons")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    setSeasons((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, is_active: !s.is_active } : x)),
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ New season</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <p className="p-6 text-sm text-destructive">{loadError}</p>
          ) : seasons.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No seasons yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seasons.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{formatDate(s.start_date)}</TableCell>
                    <TableCell>{formatDate(s.end_date)}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setActive(s)}
                        className="cursor-pointer"
                        title="Toggle active"
                      >
                        {s.is_active ? (
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
                          onClick={() => openEdit(s)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(s)}
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
              {editing ? "Edit season" : "Create season"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="2026 Season"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm({ ...form, start_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) =>
                    setForm({ ...form, end_date: e.target.value })
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              Active
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
