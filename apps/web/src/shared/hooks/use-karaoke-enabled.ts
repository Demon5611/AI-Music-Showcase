"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "karaoke-enabled";

function readStoredValue(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function useKaraokeEnabled() {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    setEnabledState(readStoredValue());
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return { enabled, setEnabled, toggle };
}
