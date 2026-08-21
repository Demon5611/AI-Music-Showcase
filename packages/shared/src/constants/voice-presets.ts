export interface VoicePresetDsp {
  bassGainDb: number;
  trebleGainDb: number;
  presenceGainDb: number;
}

export const VOICE_PRESET_IDS = ["warm", "deep", "bright", "energetic", "soft"] as const;

export type VoicePresetId = (typeof VOICE_PRESET_IDS)[number];

export type VoicePresetSelection = VoicePresetId | "none";

export interface VoicePresetDefinition {
  id: VoicePresetId;
  /** Legacy display label; web Editor UI translates by `id` via next-intl. */
  label: string;
  /** Legacy description; web Editor UI translates by `id` via next-intl. */
  description: string;
  dsp: VoicePresetDsp;
}

/** Bump when tuning preset gains so editor preview cache invalidates. */
export const VOICE_PRESET_DSP_VERSION = 2;

export const VOICE_PRESETS: readonly VoicePresetDefinition[] = [
  {
    id: "warm",
    label: "Тёплый",
    description: "Мягкий низ и приглушённые верха",
    dsp: { bassGainDb: 12, trebleGainDb: -9, presenceGainDb: -5 },
  },
  {
    id: "deep",
    label: "Глубокий",
    description: "Больше баса, плотнее тембр",
    dsp: { bassGainDb: 16, trebleGainDb: -11, presenceGainDb: -7 },
  },
  {
    id: "bright",
    label: "Яркий",
    description: "Чётче верха и присутствие",
    dsp: { bassGainDb: -9, trebleGainDb: 12, presenceGainDb: 9 },
  },
  {
    id: "energetic",
    label: "Энергичный",
    description: "Больше драйва и яркости",
    dsp: { bassGainDb: 6, trebleGainDb: 10, presenceGainDb: 12 },
  },
  {
    id: "soft",
    label: "Мягкий",
    description: "Приглушённые верха, спокойная подача",
    dsp: { bassGainDb: 4, trebleGainDb: -12, presenceGainDb: -7 },
  },
] as const;

export function resolveVoicePresetDefinition(
  presetId: VoicePresetId,
): VoicePresetDefinition | undefined {
  return VOICE_PRESETS.find((preset) => preset.id === presetId);
}

export function resolveVoicePresetDsp(presetId: VoicePresetSelection): VoicePresetDsp {
  if (presetId === "none") {
    return { bassGainDb: 0, trebleGainDb: 0, presenceGainDb: 0 };
  }

  const preset = resolveVoicePresetDefinition(presetId);
  return preset?.dsp ?? { bassGainDb: 0, trebleGainDb: 0, presenceGainDb: 0 };
}

export function resolveActiveVoicePresetFromOperations(
  operations: ReadonlyArray<{ type: string; presetId?: VoicePresetSelection }>,
): VoicePresetSelection {
  let presetId: VoicePresetSelection = "none";

  for (const operation of operations) {
    if (operation.type === "APPLY_VOICE_PRESET" && operation.presetId) {
      presetId = operation.presetId;
    }
  }

  return presetId;
}
