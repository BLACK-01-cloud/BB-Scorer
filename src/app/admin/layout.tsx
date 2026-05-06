import { requireAdmin } from "@/lib/auth/guards";
import { TopAppBar } from "@/components/chrome/top-app-bar";
import { BottomNav, BottomNavSpacer } from "@/components/chrome/bottom-nav";
import { AdminNav } from "./admin-nav";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/seasons", label: "Seasons" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/team-players", label: "Assign Player to Team" },
  { href: "/admin/matches", label: "Matches" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin("/admin");

  const signOut = (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Sign out
      </button>
    </form>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TopAppBar
        active="admin"
        homeHref="/admin"
        rightSlot={
          <div className="flex items-center gap-2">
            <span className="hidden lg:inline label-caps text-muted-foreground/80 max-w-[8rem] truncate">
              {profile.username}
            </span>
            {signOut}
          </div>
        }
      />

      <div className="border-b border-border/60 bg-card/40">
        <AdminNav items={navItems} />
      </div>

      <main className="container py-8 flex-1 px-4 md:px-8">{children}</main>

      <BottomNavSpacer />
      <BottomNav />
    </div>
  );
}
