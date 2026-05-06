"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useGlobalLoading } from "@/components/loading-provider";

type SeasonOpt = { id: string; name: string; is_active: boolean };

// Drives the dashboard's "Season leaders" section via the ?season=<id> URL
// param. The server component reads the param and re-renders.
export function SeasonFilter({
  seasons,
  selectedId,
}: {
  seasons: SeasonOpt[];
  selectedId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loading = useGlobalLoading();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending) return;
    const stop = loading.start();
    return stop;
  }, [isPending, loading]);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("season", next);
    else params.delete("season");
    startTransition(() => {
      router.push(`/admin?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="label-caps text-muted-foreground hidden sm:inline">
        Season
      </span>
      <Select
        value={selectedId}
        onChange={onChange}
        className="w-auto min-w-[10rem] h-9 text-sm"
        disabled={isPending}
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.is_active ? " (active)" : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}
