"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "ai-music-editor-hints-visible";

interface HintsVisibilityContextValue {
  hintsVisible: boolean;
  setHintsVisible: (value: boolean) => void;
}

const HintsVisibilityContext = createContext<HintsVisibilityContextValue | null>(null);

export function HintsVisibilityProvider({ children }: { children: ReactNode }) {
  const [hintsVisible, setHintsVisibleState] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored === "true" || stored === "false") {
      setHintsVisibleState(stored === "true");
    }
  }, []);

  function setHintsVisible(value: boolean) {
    setHintsVisibleState(value);
    window.localStorage.setItem(STORAGE_KEY, String(value));
  }

  return (
    <HintsVisibilityContext.Provider value={{ hintsVisible, setHintsVisible }}>
      {children}
    </HintsVisibilityContext.Provider>
  );
}

export function useHintsVisibility(): HintsVisibilityContextValue {
  const context = useContext(HintsVisibilityContext);

  if (!context) {
    throw new Error("useHintsVisibility must be used within HintsVisibilityProvider");
  }

  return context;
}

export function useOptionalHintsVisible(): boolean | null {
  return useContext(HintsVisibilityContext)?.hintsVisible ?? null;
}
