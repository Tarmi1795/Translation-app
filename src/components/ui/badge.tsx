import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border bg-[var(--subtle)] px-2.5 text-xs font-semibold leading-none text-[var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}
