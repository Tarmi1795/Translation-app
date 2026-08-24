"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { useUi } from "@/components/providers";

export function UiControls() {
  const { locale, setLocale, theme, toggleTheme } = useUi();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setLocale(locale === "en" ? "ar" : "en")}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--muted)] shadow-sm transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.98] hover:border-[var(--border-strong)] hover:bg-[var(--subtle)] hover:text-[var(--foreground)]"
        aria-label={locale === "en" ? "Switch interface to Arabic" : "تغيير الواجهة إلى الإنجليزية"}
      >
        <Languages aria-hidden="true" size={18} />
        <span>{locale === "en" ? "العربية" : "English"}</span>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className="grid size-11 place-items-center rounded-xl border bg-[var(--surface)] text-[var(--muted)] shadow-sm transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.96] hover:border-[var(--border-strong)] hover:bg-[var(--subtle)] hover:text-[var(--foreground)]"
        aria-label={theme === "light" ? "Use dark theme" : "Use light theme"}
      >
        {theme === "light" ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
      </button>
    </div>
  );
}
