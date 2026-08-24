"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Locale = "en" | "ar";
type Theme = "light" | "dark";

interface UiContextValue {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  toggleTheme: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const savedLocale = localStorage.getItem("eatai_locale");
    const savedTheme = localStorage.getItem("eatai_theme");
    const nextLocale = savedLocale === "ar" ? "ar" : "en";
    const nextTheme =
      savedTheme === "dark" ||
      (savedTheme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";
    // Preferences are browser-only and intentionally hydrate after the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(nextLocale);
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale, theme]);

  const value = useMemo<UiContextValue>(
    () => ({
      locale,
      theme,
      setLocale(next) {
        setLocaleState(next);
        localStorage.setItem("eatai_locale", next);
      },
      toggleTheme() {
        setTheme((current) => {
          const next = current === "light" ? "dark" : "light";
          localStorage.setItem("eatai_theme", next);
          return next;
        });
      },
    }),
    [locale, theme],
  );

  return (
    <UiContext.Provider value={value}>
      <div dir={locale === "ar" ? "rtl" : "ltr"}>{children}</div>
    </UiContext.Provider>
  );
}

export function useUi() {
  const value = useContext(UiContext);
  if (!value) throw new Error("useUi must be used inside Providers");
  return value;
}
