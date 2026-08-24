import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-transparent font-semibold transition-[background-color,color,border-color,box-shadow,opacity,transform] duration-200 ease-out active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        variant === "primary" &&
          "border-[color:color-mix(in_srgb,var(--primary)_88%,black)] bg-[var(--primary)] text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_18%,transparent)] hover:bg-[var(--primary-hover)] hover:shadow-[0_10px_26px_color-mix(in_srgb,var(--primary)_23%,transparent)] dark:border-transparent dark:text-[#0e1724]",
        variant === "secondary" &&
          "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm hover:border-[var(--border-strong)] hover:bg-[var(--subtle)]",
        variant === "ghost" && "text-[var(--muted)] hover:bg-[var(--subtle)] hover:text-[var(--foreground)]",
        variant === "danger" && "bg-[var(--danger)] text-white hover:opacity-90",
        size === "sm" && "min-h-10 px-3 text-sm",
        size === "md" && "px-4 text-sm",
        size === "lg" && "min-h-13 px-6 text-base",
        className,
      )}
      {...props}
    />
  );
});
