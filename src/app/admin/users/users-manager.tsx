"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { User, UserRole, UserStatus } from "@/lib/types/database";
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
  createUserAction,
  updateUserAction,
  resetPasswordAction,
  deleteUserAction,
} from "./actions";

type CreateForm = {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
};

const emptyCreate: CreateForm = {
  username: "",
  email: "",
  password: "",
  full_name: "",
  role: "scorer",
  status: "active",
};

type EditForm = {
  username: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
};

export default function UsersManager({
  initial,
  currentUserId,
  loadError,
}: {
  initial: User[];
  currentUserId: string;
  loadError: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);

  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const [resettingFor, setResettingFor] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  function refresh() {
    router.refresh();
  }

  function onCreate() {
    const fd = new FormData();
    Object.entries(createForm).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      const res = await createUserAction(fd);
      if (!res.ok) {
        toast.push(res.error, "error");
        return;
      }
      toast.push("User created.", "success");
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      refresh();
    });
  }

  function onSaveEdit() {
    if (!editing || !editForm) return;
    const fd = new FormData();
    Object.entries(editForm).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      const res = await updateUserAction(editing.id, fd);
      if (!res.ok) {
        toast.push(res.error, "error");
        return;
      }
      toast.push("User updated.", "success");
      setEditing(null);
      setEditForm(null);
      refresh();
    });
  }

  function onResetPassword() {
    if (!resettingFor) return;
    const fd = new FormData();
    fd.set("password", newPassword);
    startTransition(async () => {
      const res = await resetPasswordAction(resettingFor.id, fd);
      if (!res.ok) {
        toast.push(res.error, "error");
        return;
      }
      toast.push("Password reset.", "success");
      setResettingFor(null);
      setNewPassword("");
    });
  }

  function onDelete(u: User) {
    if (u.id === currentUserId) {
      toast.push("You can't delete your own account.", "error");
      return;
    }
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteUserAction(u.id);
      if (!res.ok) {
        toast.push(res.error, "error");
        return;
      }
      toast.push("User deleted.", "success");
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)} disabled={pending}>
          + New user
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <p className="p-6 text-sm text-destructive">{loadError}</p>
          ) : initial.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No users yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initial.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "success" : "outline"}
                      >
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          u.status === "active" ? "success" : "outline"
                        }
                      >
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(u);
                            setEditForm({
                              username: u.username,
                              full_name: u.full_name ?? "",
                              role: u.role,
                              status: u.status,
                            });
                          }}
                          disabled={pending}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setResettingFor(u);
                            setNewPassword("");
                          }}
                          disabled={pending}
                        >
                          Reset password
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(u)}
                          disabled={pending || u.id === currentUserId}
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    username: e.target.value.toLowerCase(),
                  })
                }
                placeholder="jane.doe"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Initial password</Label>
              <Input
                type="text"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm({ ...createForm, password: e.target.value })
                }
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label>Full name (optional)</Label>
              <Input
                value={createForm.full_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, full_name: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      role: e.target.value as UserRole,
                    })
                  }
                >
                  <option value="scorer">scorer</option>
                  <option value="admin">admin</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={createForm.status}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      status: e.target.value as UserStatus,
                    })
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setEditForm(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit user {editing ? `· ${editing.email}` : ""}
            </DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={editForm.username}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      username: e.target.value.toLowerCase(),
                    })
                  }
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, full_name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        role: e.target.value as UserRole,
                      })
                    }
                  >
                    <option value="scorer">scorer</option>
                    <option value="admin">admin</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        status: e.target.value as UserStatus,
                      })
                    }
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setEditForm(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={onSaveEdit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={!!resettingFor}
        onOpenChange={(open) => {
          if (!open) {
            setResettingFor(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset password{resettingFor ? ` · ${resettingFor.username}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>New password</Label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <p className="text-xs text-muted-foreground">
                Share this with the user out of band; it isn&apos;t emailed.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResettingFor(null);
                setNewPassword("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={onResetPassword} disabled={pending}>
              {pending ? "Resetting…" : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
