import { z } from "zod";
import { VOICE_PRESET_IDS } from "../constants/voice-presets.js";

const editorTrackIdSchema = z.enum(["vocal", "instrumental"]);

export const SetVolumeOperationSchema = z.object({
  type: z.literal("SET_VOLUME"),
  trackId: editorTrackIdSchema,
  regionId: z.string().min(1),
  gainDb: z.number().min(-24).max(12),
});

export const MuteTrackOperationSchema = z.object({
  type: z.literal("MUTE_TRACK"),
  trackId: editorTrackIdSchema,
  muted: z.boolean(),
  /** Legacy field; mute is track-wide and does not require a region. */
  regionId: z.string().min(1).optional(),
});

export const SoloTrackOperationSchema = z.object({
  type: z.literal("SOLO_TRACK"),
  trackId: editorTrackIdSchema,
  regionId: z.string().min(1),
  solo: z.boolean(),
});

export const DeleteRegionOperationSchema = z.object({
  type: z.literal("DELETE_REGION"),
  regionId: z.string().min(1),
});

export const DeleteRangeOperationSchema = z.object({
  type: z.literal("DELETE_RANGE"),
  regionId: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(1),
});

export function normalizeLegacyEditOperation(input: unknown): unknown {
  if (input && typeof input === "object" && "type" in input && input.type === "CUT_REGION") {
    return { ...input, type: "DELETE_REGION" };
  }

  return input;
}

export const SplitRegionOperationSchema = z.object({
  type: z.literal("SPLIT_REGION"),
  regionId: z.string().min(1),
  splitAtMs: z.number().int().min(0),
});

export const MoveRegionOperationSchema = z.object({
  type: z.literal("MOVE_REGION"),
  regionId: z.string().min(1),
  targetIndex: z.number().int().min(0),
});

export const MoveTrackRegionOperationSchema = z.object({
  type: z.literal("MOVE_TRACK_REGION"),
  trackId: editorTrackIdSchema,
  regionId: z.string().min(1),
  targetIndex: z.number().int().min(0),
});

export const DuplicateRegionOperationSchema = z.object({
  type: z.literal("DUPLICATE_REGION"),
  regionId: z.string().min(1),
});

export const ResizeRegionOperationSchema = z.object({
  type: z.literal("RESIZE_REGION"),
  regionId: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(1),
});

export const ResizeTrackRegionOperationSchema = z.object({
  type: z.literal("RESIZE_TRACK_REGION"),
  trackId: editorTrackIdSchema,
  regionId: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(1),
});

export const FadeOperationSchema = z.object({
  type: z.literal("FADE"),
  trackId: editorTrackIdSchema,
  regionId: z.string().min(1),
  fadeType: z.enum(["in", "out"]),
  durationMs: z.number().int().min(100).max(10_000),
  rangeStartMs: z.number().int().min(0).optional(),
  rangeEndMs: z.number().int().min(1).optional(),
});

export const ApplyVoicePresetOperationSchema = z.object({
  type: z.literal("APPLY_VOICE_PRESET"),
  trackId: z.literal("vocal"),
  presetId: z.enum([...VOICE_PRESET_IDS, "none"]),
});

export const EditOperationSchema = z.preprocess(
  normalizeLegacyEditOperation,
  z.discriminatedUnion("type", [
    SetVolumeOperationSchema,
    MuteTrackOperationSchema,
    SoloTrackOperationSchema,
    DeleteRegionOperationSchema,
    DeleteRangeOperationSchema,
    SplitRegionOperationSchema,
    MoveRegionOperationSchema,
    MoveTrackRegionOperationSchema,
    DuplicateRegionOperationSchema,
    ResizeRegionOperationSchema,
    ResizeTrackRegionOperationSchema,
    FadeOperationSchema,
    ApplyVoicePresetOperationSchema,
  ]),
);

export const ApplyOperationBodySchema = z.object({
  operation: EditOperationSchema,
  selectedRegionId: z.string().nullable().optional(),
  selectedTrackId: editorTrackIdSchema.nullable().optional(),
});

export type ParsedEditOperation = z.infer<typeof EditOperationSchema>;
export type ParsedApplyOperationBody = z.infer<typeof ApplyOperationBodySchema>;
