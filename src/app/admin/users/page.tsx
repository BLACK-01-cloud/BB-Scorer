import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import type { User } from "@/lib/types/database";
import UsersManager from "./users-manager";
import { PageHeader } from "@/components/chrome/page-header";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdmin("/admin/users");

  // Use the service-role client so we get the full list (RLS would also let
  // an admin read all rows, but listing through the admin client keeps this
  // page's reads consistent with the writes happening in actions.ts).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage admins and scorers. Login uses username; Supabase Auth still stores the email under the hood."
      />
      <UsersManager
        currentUserId={me.id}
        initial={(data ?? []) as User[]}
        loadError={error?.message ?? null}
      />
    </div>
  );
}
