import Link from "next/link";
import { type Branding, FALLBACK_ICON } from "@/lib/branding-constants";
import { cn } from "@/lib/utils";

export function BrandingMark({
  branding,
  href = "/",
  suffix,
  size = "md",
  className,
}: {
  branding: Branding;
  href?: string;
  suffix?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <Link href={href} className={cn("flex items-center gap-2 group", className)}>
      {branding.logo_url ? (
        // Plain <img> so we don't need Next/Image remote-pattern config for
        // the Supabase storage host. Logos are tiny PNG/SVG/WebP — no perf win
        // from the optimizer here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logo_url}
          alt={branding.site_name}
          className={cn(dim, "rounded object-contain bg-background")}
        />
      ) : (
        <div
          className={cn(
            dim,
            "rounded-full bg-primary text-primary-foreground grid place-items-center font-bold",
          )}
        >
          {FALLBACK_ICON}
        </div>
      )}
      <span className={cn("font-bold", size === "md" ? "text-base" : "text-sm")}>
        {branding.site_name}
        {suffix ? (
          <span className="text-muted-foreground font-normal">
            {" · "}
            {suffix}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
