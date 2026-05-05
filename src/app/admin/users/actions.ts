"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import type { UserRole, UserStatus } from "@/lib/types/database";

const USERNAME_RE = /^[a-z0-9._-]{2,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ActionResult = { ok: true } | { ok: false; error: string };

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export async function createUserAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin("/admin/users");

  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "scorer") as UserRole;
  const status = String(formData.get("status") ?? "active") as UserStatus;

  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error:
        "Username must be 2-64 chars, lowercase letters/numbers/._- only.",
    };
  }
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Invalid email." };
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (role !== "admin" && role !== "scorer") {
    return { ok: false, error: "Invalid role." };
  }
  if (status !== "active" && status !== "inactive") {
    return { ok: false, error: "Invalid status." };
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName || null },
  });
  if (createError || !created.user) {
    return { ok: false, error: createError?.message ?? "Could not create user." };
  }

  // The auth.users trigger inserts a public.users row with role='scorer' and
  // status='active'. Reconcile with the form's role/status/full_name (and the
  // chosen username, since the trigger may have appended a suffix on collision).
  const { error: updateError } = await admin
    .from("users")
    .update({
      username,
      full_name: fullName || null,
      role,
      status,
    })
    .eq("id", created.user.id);
  if (updateError) {
    // Roll back the auth user so the operator can retry cleanly.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserAction(
  userId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin("/admin/users");

  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as UserRole;
  const status = String(formData.get("status") ?? "") as UserStatus;

  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error:
        "Username must be 2-64 chars, lowercase letters/numbers/._- only.",
    };
  }
  if (role !== "admin" && role !== "scorer") {
    return { ok: false, error: "Invalid role." };
  }
  if (status !== "active" && status !== "inactive") {
    return { ok: false, error: "Invalid status." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({
      username,
      full_name: fullName || null,
      role,
      status,
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resetPasswordAction(
  userId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin("/admin/users");

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const me = await requireAdmin("/admin/users");
  if (me.id === userId) {
    return { ok: false, error: "You can't delete your own account." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}
