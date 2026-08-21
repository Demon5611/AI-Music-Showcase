"use client";

import type { EditOperation } from "@ai-music/shared";
import {
  VERSION_HISTORY_OPERATION_LIMIT,
  type VoicePresetId,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { me } from "@/features/music-editor/music-editor-classes";
import {
  selectRegionLabel,
  useAudioEditorStore,
} from "@/features/music-editor/store/audio-editor-store";
import { PlanGatedWrap, usePlanGate } from "@/shared/ui/plan-gated";
import { Tooltip } from "@/shared/ui/tooltip";

interface EditHistoryPanelProps {
  operations: EditOperation[];
  disabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

type HistoryTranslate = ReturnType<typeof useTranslations<"Editor.history">>;
type PresetTranslate = ReturnType<typeof useTranslations<"Editor.voicePresets">>;

function formatOperationLabel(
  operation: EditOperation,
  regions: ReturnType<typeof useAudioEditorStore.getState>["regions"],
  t: HistoryTranslate,
  tPresets: PresetTranslate,
  emptyValue: string,
): string {
  const region =
    "regionId" in operation ? regions.find((item) => item.id === operation.regionId) : null;
  const regionLabel = region ? selectRegionLabel(region) : emptyValue;

  switch (operation.type) {
    case "SET_VOLUME":
      return t("volume", {
        trackId: operation.trackId,
        gainDb: operation.gainDb,
        region: regionLabel,
      });
    case "MUTE_TRACK":
      return operation.muted
        ? t("mute", { trackId: operation.trackId, scope: t("wholeTrack") })
        : t("unmute", { trackId: operation.trackId, scope: t("wholeTrack") });
    case "SOLO_TRACK":
      return operation.solo
        ? t("solo", { trackId: operation.trackId, region: regionLabel })
        : t("unsolo", { trackId: operation.trackId, region: regionLabel });
    case "FADE":
      return t("fade", { fadeType: operation.fadeType, region: regionLabel });
    case "SPLIT_REGION":
      return t("split", { region: regionLabel });
    case "DUPLICATE_REGION":
      return t("duplicate", { region: regionLabel });
    case "MOVE_REGION":
      return t("move", { region: regionLabel });
    case "MOVE_TRACK_REGION":
      return t("moveTrack", { trackId: operation.trackId, region: regionLabel });
    case "DELETE_REGION":
      return t("delete", { region: regionLabel });
    case "DELETE_RANGE":
      return t("deleteRange", { region: regionLabel });
    case "RESIZE_REGION":
      return t("resize", { region: regionLabel });
    case "RESIZE_TRACK_REGION":
      return t("resizeTrack", { trackId: operation.trackId, region: regionLabel });
    case "APPLY_VOICE_PRESET": {
      if (operation.presetId === "none") {
        return t("voicePresetOriginal");
      }

      const presetId = operation.presetId as VoicePresetId;
      return t("voicePreset", {
        label: tPresets(`presets.${presetId}.label`),
      });
    }
    default:
      return t("operation", { region: regionLabel });
  }
}

export function EditHistoryPanel({
  operations,
  disabled = false,
  onUndo,
  onRedo,
}: EditHistoryPanelProps) {
  const t = useTranslations("Editor.history");
  const tPresets = useTranslations("Editor.voicePresets");
  const tCommon = useTranslations("Common");
  const regions = useAudioEditorStore((state) => state.regions);
  const undoneOperations = useAudioEditorStore((state) => state.undoneOperations);
  const setSelectedRegion = useAudioEditorStore((state) => state.setSelectedRegion);
  const subscriptionQuery = useSubscriptionQuery();
  const historyGate = usePlanGate("versionHistory");
  const historyLocked = !historyGate.allowed;
  const versionHistoryLevel = subscriptionQuery.data?.entitlements.features.versionHistory;
  const operationLimit =
    versionHistoryLevel === "standard" ? VERSION_HISTORY_OPERATION_LIMIT.standard : null;

  return (
    <div className={me.panel}>
      <h3 className={me.panelTitle}>{t("title")}</h3>

      {operationLimit !== null ? (
        <p className={me.panelHint}>
          {t("operationsCount", { count: operations.length, limit: operationLimit })}
        </p>
      ) : null}

      {operations.length === 0 ? (
        <p className={me.panelHint}>{t("empty")}</p>
      ) : (
        <ol className={me.historyList}>
          {operations.map((operation, index) => {
            const regionId = "regionId" in operation ? operation.regionId : null;

            return (
              <li className={me.historyItem} key={`${operation.type}-${index}`}>
                <Tooltip content={t("jumpTooltip")}>
                  <button
                    className={me.historyButton}
                    type="button"
                    onClick={() => {
                      if (regionId) {
                        setSelectedRegion(regionId);
                      }
                    }}
                  >
                    {index + 1}.{" "}
                    {formatOperationLabel(
                      operation,
                      regions,
                      t,
                      tPresets,
                      tCommon("emptyValue"),
                    )}
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ol>
      )}

      <div className={me.toolbarRow}>
        <PlanGatedWrap feature="versionHistory">
          <Tooltip content={t("undoTooltip")}>
            <button
              className={me.toolButton}
              disabled={disabled || historyLocked || operations.length === 0}
              type="button"
              onClick={onUndo}
            >
              {t("undo")}
            </button>
          </Tooltip>
        </PlanGatedWrap>
        <PlanGatedWrap feature="versionHistory">
          <Tooltip content={t("redoTooltip")}>
            <button
              className={me.toolButton}
              disabled={disabled || historyLocked || undoneOperations.length === 0}
              type="button"
              onClick={onRedo}
            >
              {t("redo")}
            </button>
          </Tooltip>
        </PlanGatedWrap>
      </div>
    </div>
  );
}
