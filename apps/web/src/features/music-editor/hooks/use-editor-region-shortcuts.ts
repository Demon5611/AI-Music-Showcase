"use client";

import { useEffect } from "react";

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

export function useEditorRegionShortcuts(
  disabled: boolean,
  deleteRegion: () => void,
) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (disabled || isTextInputTarget(event.target)) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      deleteRegion();
    }

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [deleteRegion, disabled]);
}
