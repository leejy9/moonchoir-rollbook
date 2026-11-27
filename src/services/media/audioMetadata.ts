/**
 * Reads the duration in seconds of an audio file in the browser using HTML5 Audio.
 * Complies with F8:
 * - Creates an object URL via URL.createObjectURL(file)
 * - Listens for 'loadedmetadata' event on new Audio()
 * - Revokes object URL in all cases (URL.revokeObjectURL)
 * - Returns undefined if duration is NaN, Infinity, <= 0, or if 5000ms timeout is reached.
 */
export async function readAudioDuration(file: Blob | File): Promise<number | undefined> {
  if (typeof globalThis.Audio === 'undefined') {
    return undefined;
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return undefined;
  }

  return new Promise<number | undefined>((resolve) => {
    let objectUrl: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (objectUrl && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore cleanup errors
        }
        objectUrl = null;
      }
    };

    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    try {
      objectUrl = URL.createObjectURL(file);
      const audio = new Audio();

      timer = setTimeout(() => {
        finish(undefined);
      }, 5000);

      const onLoadedMetadata = () => {
        const rawDuration = audio.duration;
        if (
          typeof rawDuration === 'number' &&
          Number.isFinite(rawDuration) &&
          !Number.isNaN(rawDuration) &&
          rawDuration > 0
        ) {
          finish(Math.round(rawDuration));
        } else {
          finish(undefined);
        }
      };

      const onError = () => {
        finish(undefined);
      };

      audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.src = objectUrl;
    } catch {
      finish(undefined);
    }
  });
}
