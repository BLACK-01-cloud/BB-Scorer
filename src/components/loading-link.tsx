"use client";

import { useEffect, useTransition, type AnchorHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { useGlobalLoading } from "@/components/loading-provider";

type LoadingLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

// Drop-in <a>/Link replacement that shows the global loader during the
// client-side navigation transition. Modifier-clicks and target="_blank"
// fall through to the browser's default behavior.
export function LoadingLink({
  href,
  onClick,
  target,
  children,
  ...rest
}: LoadingLinkProps) {
  const router = useRouter();
  const loading = useGlobalLoading();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending) return;
    const stop = loading.start();
    return stop;
  }, [isPending, loading]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (target === "_blank") return;
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      (e as unknown as { button?: number }).button === 1
    ) {
      return;
    }
    e.preventDefault();
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <a href={href} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
