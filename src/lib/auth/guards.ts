import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User as DbUser } from "@/lib/types/database";

export async function getCurrentUserProfile(): Promise<DbUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as DbUser | null) ?? null;
}

export async function requireAuth(next: string): Promise<DbUser> {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (profile.status !== "active") {
    await createClient().auth.signOut();
    redirect("/login?error=inactive");
  }
  return profile;
}

export async function requireAdmin(next: string): Promise<DbUser> {
  const profile = await requireAuth(next);
  if (profile.role !== "admin") redirect("/scorer/matches");
  return profile;
}

export async function requireScorerOrAdmin(next: string): Promise<DbUser> {
  const profile = await requireAuth(next);
  if (profile.role !== "admin" && profile.role !== "scorer") {
    redirect("/login?error=forbidden");
  }
  return profile;
}
