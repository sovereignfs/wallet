import { type Scanned, readQr } from './read';

/**
 * Scanning with the camera (DESIGN.md §13.2): `getUserMedia` (the back camera) and the browser's own `BarcodeDetector` where it reads QR codes, and
 * otherwise `zxing-wasm` (`read.ts`) on frames drawn to a canvas. **Permission is asked only when a person starts scanning**, and refusing it, or having
 * no camera, is an answer and not an error: the caller offers typing. Nothing leaves the device: a frame is read here and dropped.
 */
export type CameraProblem = 'denied' | 'none' | 'unsupported' | 'in_use';

export interface Camera {
  /** Stops the camera and the loop. */
  stop(): void;
}

/** What `BarcodeDetector` is, as far as this uses it. */
interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorConstructor = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

async function nativeDetector(): Promise<Detector | undefined> {
  const Native = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (!Native) return undefined;
  try {
    if (!(await Native.getSupportedFormats()).includes('qr_code')) return undefined;
    return new Native({ formats: ['qr_code'] });
  } catch {
    return undefined;
  }
}

/** Whether this browser has a camera it can ask for. */
export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Starts the camera into `video` and calls `onFound` once with the first QR code it reads. Rejects with a `CameraProblem` where it cannot start. */
export async function startScanning(
  video: HTMLVideoElement,
  onFound: (scanned: Scanned) => void,
): Promise<Camera> {
  if (!cameraSupported()) throw 'unsupported' satisfies CameraProblem;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw (
      name === 'NotAllowedError' || name === 'SecurityError'
        ? 'denied'
        : name === 'NotReadableError'
          ? 'in_use'
          : 'none'
    ) satisfies CameraProblem;
  }
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => undefined);

  const detector = await nativeDetector();
  const canvas = document.createElement('canvas');
  let stopped = false;
  let handle = 0;

  const stop = () => {
    stopped = true;
    cancelAnimationFrame(handle);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        let found: Scanned | null = null;
        if (detector) {
          const [hit] = await detector.detect(video);
          if (hit?.rawValue) found = { text: hit.rawValue, format: 'qr' };
        } else {
          // Large frames cost time and add nothing a phone's screen needs: the longest side is 800 pixels.
          const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            found = await readQr({
              data: image.data as Uint8ClampedArray<ArrayBuffer>,
              width: image.width,
              height: image.height,
            });
          }
        }
        if (found && !stopped) {
          stop();
          onFound(found);
          return;
        }
      }
    } catch {
      // A frame that could not be read is skipped; the next is tried.
    }
    if (!stopped) handle = requestAnimationFrame(() => void tick());
  };
  handle = requestAnimationFrame(() => void tick());
  return { stop };
}

/** Reads a QR code from a picture: a file chosen, a screenshot pasted or dropped. Null when there is none in it. */
export async function scanImageFile(file: Blob): Promise<Scanned | null> {
  const bitmap = await createImageBitmap(file);
  try {
    // A phone's photo is large: it is drawn smaller, as a camera frame is.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    // A transparent screenshot would read as black: it is laid on white first.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return await readQr({
      data: image.data as Uint8ClampedArray<ArrayBuffer>,
      width: image.width,
      height: image.height,
    });
  } finally {
    bitmap.close();
  }
}
