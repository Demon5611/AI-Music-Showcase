"use client";

import { useServerInsertedHTML } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "theme";
const RESOLVED_THEMES = ["light", "dark"] as const;
const THEMES = [...RESOLVED_THEMES, "system"] as const;

type ResolvedTheme = (typeof RESOLVED_THEMES)[number];
type ThemeSetting = (typeof THEMES)[number];

type ThemeContextValue = {
  theme: ThemeSetting | undefined;
  resolvedTheme: ResolvedTheme | undefined;
  setTheme: (theme: ThemeSetting) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_BLOCKING_SCRIPT = `(function(){try{var k="${STORAGE_KEY}";var d="dark";var t=localStorage.getItem(k)||d;var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var e=document.documentElement;e.classList.remove("light","dark");e.classList.add(r);e.style.colorScheme=r;}catch(x){}})();`;

function readStoredTheme(): ThemeSetting {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    return "dark";
  }

  return "dark";
}

function resolveTheme(theme: ThemeSetting): ResolvedTheme {
  if (theme === "system") {
    if (typeof window === "undefined") {
      return "dark";
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return theme;
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.remove(...RESOLVED_THEMES);
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: ThemeSetting;
};

export function ThemeProvider({ children, defaultTheme = "dark" }: ThemeProviderProps) {
  useServerInsertedHTML(() => (
    <script
      dangerouslySetInnerHTML={{ __html: THEME_BLOCKING_SCRIPT }}
      suppressHydrationWarning
    />
  ));

  const [theme, setThemeState] = useState<ThemeSetting | undefined>(undefined);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme | undefined>(undefined);

  useEffect(() => {
    const storedTheme = readStoredTheme();
    const resolved = resolveTheme(storedTheme);
    setThemeState(storedTheme);
    setResolvedTheme(resolved);
    applyResolvedTheme(resolved);
  }, []);

  useEffect(() => {
    if (!theme) {
      return;
    }

    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyResolvedTheme(resolved);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore private mode storage errors.
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemChange(): void {
      const resolved = resolveTheme("system");
      setResolvedTheme(resolved);
      applyResolvedTheme(resolved);
    }

    mediaQuery.addEventListener("change", handleSystemChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemChange);
    };
  }, [theme]);

  const setTheme = useCallback((nextTheme: ThemeSetting) => {
    setThemeState(nextTheme);
  }, []);

  const value = useMemo(
    () => ({
      theme: theme ?? defaultTheme,
      resolvedTheme,
      setTheme,
    }),
    [defaultTheme, resolvedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
