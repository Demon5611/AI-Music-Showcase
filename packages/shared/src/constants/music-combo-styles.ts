export interface MusicComboStylePreset {
  label: string;
  style: string;
}

export const MUSIC_COMBO_STYLE_PRESETS: MusicComboStylePreset[] = [
  {
    label: "Мечтательный лоу-фай чилл",
    style: "lo-fi chill, dreamy, soft, warm textures, relaxed",
  },
  {
    label: "Энергичный гиперпоп гимн",
    style: "hyperpop, electropop, energetic, anthemic vocal, bright synths",
  },
  {
    label: "Мрачный бэдрум-поп",
    style: "bedroom pop, gloomy, slow tempo, soft vocal, intimate",
  },
  {
    label: "Эмоциональный инди-рок",
    style: "indie rock, emotional, guitar, male vocal, mid-tempo",
  },
  {
    label: "Тёмный трап бит",
    style: "trap, dark, 808 bass, moody, minimal vocal",
  },
  {
    label: "Заряженный поп-панк",
    style: "pop-punk, energetic, fast, distorted guitar, youthful vocal",
  },
  {
    label: "Танцевальный электропоп",
    style: "electropop, dance, upbeat, synth, catchy vocal",
  },
  {
    label: "Ностальгический поп 2000-х",
    style: "pop, 2000s, nostalgic, catchy vocal, bright production",
  },
  {
    label: "Агрессивный рейдж-рэп",
    style: "rage rap, aggressive, trap, heavy 808, intense vocal",
  },
  {
    label: "Мелодичный эмо-рэп",
    style: "emo rap, melodic, emotional, trap beat, autotune vocal",
  },
];

export const FREE_TIER_DEFAULT_DURATION_SEC = 30;

/** Free / 30s: lo-fi is more reliable for voice persona swap than energetic hyperpop. */
export const FREE_TIER_DEFAULT_COMBO_STYLE =
  MUSIC_COMBO_STYLE_PRESETS.find((preset) => preset.label === "Мечтательный лоу-фай чилл")
    ?.style ??
  MUSIC_COMBO_STYLE_PRESETS[0]?.style ??
  "pop";

export function findComboStylePreset(style: string): MusicComboStylePreset | undefined {
  const normalized = style.trim().toLowerCase();

  return MUSIC_COMBO_STYLE_PRESETS.find(
    (preset) => preset.style.trim().toLowerCase() === normalized,
  );
}

export function isComboStylePreset(style: string): boolean {
  return findComboStylePreset(style) !== undefined;
}
