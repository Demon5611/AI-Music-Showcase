"use client";

import { useEffect } from "react";
import { resolveVolumeKeyboardDelta } from "@/features/music-editor/utils/volume-utils";

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target instanceof HTMLInputElement) {
    const inputType = target.type.toLowerCase();

    return inputType !== "range" && inputType !== "button" && inputType !== "checkbox";
  }

  const tag = target.tagName;

  return tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useEditorVolumeShortcuts(
  disabled: boolean,
  adjustVolume: (deltaDb: number) => void,
) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (disabled || isTextInputTarget(event.target)) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const deltaDb = resolveVolumeKeyboardDelta(event);

      if (deltaDb === null) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      adjustVolume(deltaDb);
    }

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [adjustVolume, disabled]);
}
