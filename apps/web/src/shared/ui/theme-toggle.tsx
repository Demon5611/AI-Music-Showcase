"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useTheme } from "@/shared/providers/theme-provider";
import { appShell } from "@/shared/theme/app-theme";

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

interface ThemeOptionButtonProps {
  active: boolean;
  label: string;
  Icon: typeof Sun;
  onSelect: () => void;
}

function ThemeOptionButton({ active, label, Icon, onSelect }: ThemeOptionButtonProps) {
  if (active) {
    return (
      <button
        aria-label={label}
        aria-pressed="true"
        className={appShell.themeToggleButtonActive}
        title={label}
        type="button"
        onClick={onSelect}
      >
        <Icon aria-hidden className={appShell.themeToggleIcon} />
      </button>
    );
  }

  return (
    <button
      aria-label={label}
      aria-pressed="false"
      className={appShell.themeToggleButton}
      title={label}
      type="button"
      onClick={onSelect}
    >
      <Icon aria-hidden className={appShell.themeToggleIcon} />
    </button>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("Theme");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span aria-hidden className={appShell.themeTogglePlaceholder} />;
  }

  const themes = [
    { value: "light" as const, label: t("light"), Icon: THEME_ICONS.light },
    { value: "dark" as const, label: t("dark"), Icon: THEME_ICONS.dark },
    { value: "system" as const, label: t("system"), Icon: THEME_ICONS.system },
  ];

  return (
    <div aria-label={t("groupLabel")} className={appShell.themeToggleGroup} role="group">
      {themes.map(({ value, label, Icon }) => (
        <ThemeOptionButton
          key={value}
          active={theme === value}
          Icon={Icon}
          label={label}
          onSelect={() => setTheme(value)}
        />
      ))}
    </div>
  );
}
