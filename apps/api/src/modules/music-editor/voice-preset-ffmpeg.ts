import {
  resolveActiveVoicePresetFromOperations,
  resolveVoicePresetDsp,
  type EditOperation,
  type VoicePresetDsp,
} from "@ai-music/shared";

export function buildVoicePresetFfmpegFilters(dsp: VoicePresetDsp): string[] {
  const filters: string[] = [];

  if (dsp.bassGainDb !== 0) {
    filters.push(`bass=g=${dsp.bassGainDb}`);
  }

  if (dsp.trebleGainDb !== 0) {
    filters.push(`treble=g=${dsp.trebleGainDb}`);
  }

  if (dsp.presenceGainDb !== 0) {
    filters.push(`equalizer=f=2800:width_type=o:width=1:g=${dsp.presenceGainDb}`);
  }

  return filters;
}

export function resolveVocalPresetFfmpegFilters(operations: ReadonlyArray<EditOperation>): string[] {
  const presetId = resolveActiveVoicePresetFromOperations(operations);
  const dsp = resolveVoicePresetDsp(presetId);

  return buildVoicePresetFfmpegFilters(dsp);
}
