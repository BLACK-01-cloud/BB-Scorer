"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Team, EntityStatus } from "@/lib/types/database";
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
  name: string;
  short_name: string;
  logo_url: string;
  status: EntityStatus;
};

const empty: FormState = {
  name: "",
  short_name: "",
  logo_url: "",
  status: "active",
};

export default function TeamsManager({
  initial,
  loadError,
}: {
  initial: Team[];
  loadError: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [teams, setTeams] = useState<Team[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clearLogo, setClearLogo] = useState(false);

  function resetFileState() {
    setPickedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setClearLogo(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreate() {
    setEditing(null);
    setForm(empty);
    resetFileState();
    setOpen(true);
  }
  function openEdit(t: Team) {
    setEditing(t);
    setForm({
      name: t.name,
      short_name: t.short_name,
      logo_url: t.logo_url ?? "",
      status: t.status,
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
    setClearLogo(false);
  }

  function onClearLogo() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(null);
    setPreviewUrl(null);
    setClearLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSave() {
    if (!form.name.trim() || !form.short_name.trim()) {
      toast.push("Name and short name are required.", "error");
      return;
    }
    setSaving(true);
    try {
      let nextLogoUrl: string | null = form.logo_url || null;

      if (pickedFile) {
        nextLogoUrl = await uploadAppAsset(supabase, "teams", pickedFile);
      } else if (clearLogo) {
        nextLogoUrl = null;
      }

      const previousLogoUrl = editing?.logo_url ?? null;

      const payload = {
        name: form.name.trim(),
        short_name: form.short_name.trim(),
        logo_url: nextLogoUrl,
        status: form.status,
      };
      if (editing) {
        const { data, error } = await supabase
          .from("teams")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        setTeams((prev) => prev.map((x) => (x.id === data.id ? data : x)));
        toast.push("Team updated.", "success");
      } else {
        const { data, error } = await supabase
          .from("teams")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setTeams((prev) => [data, ...prev]);
        toast.push("Team created.", "success");
      }

      if (
        previousLogoUrl &&
        previousLogoUrl !== nextLogoUrl &&
        (pickedFile || clearLogo)
      ) {
        await removeAppAssetByUrl(supabase, previousLogoUrl);
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

  async function onDelete(t: Team) {
    if (!confirm(`Delete team "${t.name}"?`)) return;
    const { error } = await supabase.from("teams").delete().eq("id", t.id);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    setTeams((prev) => prev.filter((x) => x.id !== t.id));
    if (t.logo_url) await removeAppAssetByUrl(supabase, t.logo_url);
    toast.push("Team deleted.", "success");
    router.refresh();
  }

  const previewLogoSrc = previewUrl ?? (clearLogo ? null : form.logo_url || null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ New team</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <p className="p-6 text-sm text-destructive">{loadError}</p>
          ) : teams.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No teams yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Short</TableHead>
                  <TableHead>Logo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="uppercase">{t.short_name}</TableCell>
                    <TableCell>
                      {t.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.logo_url}
                          alt=""
                          className="h-7 w-7 rounded object-cover border"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={t.status === "active" ? "success" : "outline"}
                      >
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(t)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(t)}
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
            <DialogTitle>{editing ? "Edit team" : "Create team"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Lakers"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Short name</Label>
                <Input
                  value={form.short_name}
                  onChange={(e) =>
                    setForm({ ...form, short_name: e.target.value })
                  }
                  placeholder="LAL"
                  maxLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as EntityStatus })
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="archived">archived</option>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-logo">Logo</Label>
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 rounded border bg-muted/40 grid place-items-center overflow-hidden">
                  {previewLogoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewLogoSrc}
                      alt="Logo preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    id="team-logo"
                    ref={fileInputRef}
                    type="file"
                    accept={APP_ASSETS_ALLOWED_MIMES.join(",")}
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    PNG, JPEG, WebP, or SVG. Max 2 MB.
                  </p>
                  {(pickedFile || (form.logo_url && !clearLogo)) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onClearLogo}
                    >
                      {pickedFile ? "Cancel selection" : "Remove logo"}
                    </Button>
                  )}
                </div>
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
