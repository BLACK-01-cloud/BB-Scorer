import Link from "next/link";
import { requireScorerOrAdmin } from "@/lib/auth/guards";
import { TopAppBar } from "@/components/chrome/top-app-bar";
import { BottomNav, BottomNavSpacer } from "@/components/chrome/bottom-nav";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ScorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireScorerOrAdmin("/scorer/matches");
  const matchesHref =
    profile.role === "admin" ? "/admin/matches" : "/scorer/matches";

  const right = (
    <div className="flex items-center gap-2">
      <span className="hidden lg:inline label-caps text-muted-foreground/80 max-w-[8rem] truncate">
        {profile.username}
      </span>
      <Link
        href={matchesHref}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "hidden sm:inline-flex",
        )}
      >
        Matches
      </Link>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TopAppBar active="scorer" homeHref={matchesHref} rightSlot={right} />
      <main className="container py-6 flex-1 px-4 md:px-8">{children}</main>
      <BottomNavSpacer />
      <BottomNav />
    </div>
  );
}
