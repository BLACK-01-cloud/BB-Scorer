"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Player, EntityStatus } from "@/lib/types/database";
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
import {
  APP_ASSETS_ALLOWED_MIMES,
  removeAppAssetByUrl,
  uploadAppAsset,
  validateImageFile,
} from "@/lib/storage/app-assets";

type FormState = {
  full_name: string;
  display_name: string;
  photo_url: string;
  position: string;
  status: EntityStatus;
};

const empty: FormState = {
  full_name: "",
  display_name: "",
  photo_url: "",
  position: "",
  status: "active",
};

export default function PlayersManager({
  initial,
  loadError,
}: {
  initial: Player[];
  loadError: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [players, setPlayers] = useState<Player[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clearPhoto, setClearPhoto] = useState(false);

  function resetFileState() {
    setPickedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setClearPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreate() {
    setEditing(null);
    setForm(empty);
    resetFileState();
    setOpen(true);
  }
  function openEdit(p: Player) {
    setEditing(p);
    setForm({
      full_name: p.full_name,
      display_name: p.display_name ?? "",
      photo_url: p.photo_url ?? "",
      position: p.position ?? "",
      status: p.status,
    });
    resetFileState();
    setOpen(true);
  }

  function onPickFile(file: File | null) {
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast.push(err, "error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setClearPhoto(false);
  }

  function onClearPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(null);
    setPreviewUrl(null);
    setClearPhoto(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSave() {
    if (!form.full_name.trim()) {
      toast.push("Full name is required.", "error");
      return;
    }
    setSaving(true);
    try {
      let nextPhotoUrl: string | null = form.photo_url || null;

      if (pickedFile) {
        nextPhotoUrl = await uploadAppAsset(supabase, "players", pickedFile);
      } else if (clearPhoto) {
        nextPhotoUrl = null;
      }

      const previousPhotoUrl = editing?.photo_url ?? null;

      const payload = {
        full_name: form.full_name.trim(),
        display_name: form.display_name.trim() || null,
        photo_url: nextPhotoUrl,
        position: form.position.trim() || null,
        status: form.status,
      };
      if (editing) {
        const { data, error } = await supabase
          .from("players")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        setPlayers((prev) => prev.map((x) => (x.id === data.id ? data : x)));
        toast.push("Player updated.", "success");
      } else {
        const { data, error } = await supabase
          .from("players")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setPlayers((prev) => [data, ...prev]);
        toast.push("Player created.", "success");
      }

      if (
        previousPhotoUrl &&
        previousPhotoUrl !== nextPhotoUrl &&
        (pickedFile || clearPhoto)
      ) {
        await removeAppAssetByUrl(supabase, previousPhotoUrl);
      }

      setOpen(false);
      resetFileState();
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(p: Player) {
    if (!confirm(`Delete player "${p.full_name}"?`)) return;
    const { error } = await supabase.from("players").delete().eq("id", p.id);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    setPlayers((prev) => prev.filter((x) => x.id !== p.id));
    if (p.photo_url) await removeAppAssetByUrl(supabase, p.photo_url);
    toast.push("Player deleted.", "success");
    router.refresh();
  }

  const visible = players.filter((p) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(f) ||
      (p.display_name ?? "").toLowerCase().includes(f)
    );
  });

  const previewPhotoSrc =
    previewUrl ?? (clearPhoto ? null : form.photo_url || null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <Input
          placeholder="Search players…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={openCreate}>+ New player</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <p className="p-6 text-sm text-destructive">{loadError}</p>
          ) : visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {players.length === 0 ? "No players yet." : "No matches."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Photo</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead>Display</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo_url}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover border"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted/40 border grid place-items-center text-[10px] text-muted-foreground">
                          —
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.full_name}
                    </TableCell>
                    <TableCell>{p.display_name || "—"}</TableCell>
                    <TableCell>{p.position || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={p.status === "active" ? "success" : "outline"}
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(p)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(p)}
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
              {editing ? "Edit player" : "Create player"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
                placeholder="LeBron James"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input
                  value={form.display_name}
                  onChange={(e) =>
                    setForm({ ...form, display_name: e.target.value })
                  }
                  placeholder="L. James"
                />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input
                  value={form.position}
                  onChange={(e) =>
                    setForm({ ...form, position: e.target.value })
                  }
                  placeholder="PG, SG, SF, PF, C"
                  maxLength={32}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="player-photo">Profile image</Label>
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 shrink-0 rounded-full border bg-muted/40 grid place-items-center overflow-hidden">
                  {previewPhotoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewPhotoSrc}
                      alt="Profile preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    id="player-photo"
                    ref={fileInputRef}
                    type="file"
                    accept={APP_ASSETS_ALLOWED_MIMES.join(",")}
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    PNG, JPEG, WebP, or SVG. Max 2 MB.
                  </p>
                  {(pickedFile || (form.photo_url && !clearPhoto)) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onClearPhoto}
                    >
                      {pickedFile ? "Cancel selection" : "Remove photo"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as EntityStatus,
                  })
                }
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="archived">archived</option>
              </Select>
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
