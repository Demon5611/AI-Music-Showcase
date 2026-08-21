"use client";

import { useEffect } from "react";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useEditorTransportShortcuts(disabled = false) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" && event.key !== " ") {
        return;
      }

      if (disabled || isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault(); // не скроллить страницу

      useAudioEditorStore.getState().togglePlay();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [disabled]);
}