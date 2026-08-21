const WEBM_SEEK_CAP_SEC = 1e10;

function isValidDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0;
}

function readDurationFromAudioElement(objectUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    let settled = false;

    const settle = (handler: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute("src");
      audio.load();
      handler();
    };

    const resolveDuration = (duration: number) => {
      if (!isValidDuration(duration)) {
        settle(() => reject(new Error("INVALID_AUDIO_DURATION")));
        return;
      }

      settle(() => resolve(duration));
    };

    const seekForWebmDuration = () => {
      const onSeeked = () => {
        audio.removeEventListener("seeked", onSeeked);
        resolveDuration(audio.duration);
      };

      audio.addEventListener("seeked", onSeeked);
      audio.currentTime = WEBM_SEEK_CAP_SEC;
    };

    audio.preload = "metadata";
    audio.addEventListener(
      "loadedmetadata",
      () => {
        if (isValidDuration(audio.duration)) {
          resolveDuration(audio.duration);
          return;
        }

        if (audio.duration === Infinity) {
          seekForWebmDuration();
          return;
        }

        resolveDuration(audio.duration);
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () => settle(() => reject(new Error("AUDIO_DURATION_READ_FAILED"))),
      { once: true },
    );
    audio.src = objectUrl;
  });
}

async function readDurationFromWebAudio(file: File): Promise<number> {
  const context = new AudioContext();

  try {
    const bytes = await file.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(bytes.slice(0));

    return audioBuffer.duration;
  } finally {
    await context.close();
  }
}

export function normalizeAudioDurationSec(durationSec: number): number {
  return Math.round(durationSec);
}

export async function readAudioDurationSec(file: File): Promise<number> {
  try {
    const decodedDurationSec = await readDurationFromWebAudio(file);

    if (isValidDuration(decodedDurationSec)) {
      return normalizeAudioDurationSec(decodedDurationSec);
    }
  } catch {
    // Fallback when Web Audio cannot decode the container/codec.
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const metadataDurationSec = await readDurationFromAudioElement(objectUrl);
    return normalizeAudioDurationSec(metadataDurationSec);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("AUDIO_DURATION_READ_FAILED");
  }
}
