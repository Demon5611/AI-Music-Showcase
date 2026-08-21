import type { VoicePresetDsp } from "@ai-music/shared";

export interface VoicePresetFilterChain {
  input: AudioNode;
  output: AudioNode;
  setDsp: (dsp: VoicePresetDsp) => void;
  disconnect: () => void;
}

export function createVoicePresetFilterChain(context: BaseAudioContext): VoicePresetFilterChain {
  const bass = context.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 120;

  const treble = context.createBiquadFilter();
  treble.type = "highshelf";
  treble.frequency.value = 5500;

  const presence = context.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2800;
  presence.Q.value = 1.8;

  bass.connect(treble);
  treble.connect(presence);

  function setDsp(dsp: VoicePresetDsp) {
    bass.gain.value = dsp.bassGainDb;
    treble.gain.value = dsp.trebleGainDb;
    presence.gain.value = dsp.presenceGainDb;
  }

  setDsp({ bassGainDb: 0, trebleGainDb: 0, presenceGainDb: 0 });

  return {
    input: bass,
    output: presence,
    setDsp,
    disconnect: () => {
      bass.disconnect();
      treble.disconnect();
      presence.disconnect();
    },
  };
}

/** @deprecated Prefer createVoicePresetFilterChain for live preview. */
export interface VoicePresetAudioChain {
  output: AudioNode;
  disconnect: () => void;
}

export function connectVoicePresetChain(
  context: BaseAudioContext,
  source: AudioNode,
  dsp: VoicePresetDsp,
): VoicePresetAudioChain {
  const chain = createVoicePresetFilterChain(context);
  source.connect(chain.input);
  chain.setDsp(dsp);

  return {
    output: chain.output,
    disconnect: () => chain.disconnect(),
  };
}

export async function applyVoicePresetToAudioBuffer(
  buffer: AudioBuffer,
  dsp: VoicePresetDsp,
): Promise<AudioBuffer> {
  if (dsp.bassGainDb === 0 && dsp.trebleGainDb === 0 && dsp.presenceGainDb === 0) {
    return buffer;
  }

  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );
  const source = offline.createBufferSource();
  source.buffer = buffer;

  const chain = createVoicePresetFilterChain(offline);
  source.connect(chain.input);
  chain.setDsp(dsp);
  chain.output.connect(offline.destination);
  source.start(0);

  return offline.startRendering();
}
