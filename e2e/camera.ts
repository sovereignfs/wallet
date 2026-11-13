import { writeFileSync } from 'node:fs';
import { qrModules } from '../src/barcode/draw.ts';

/**
 * A video of a QR code, for Chromium's fake camera (`--use-file-for-fake-video-capture`): a few frames of YUV4MPEG2, white with the code in black in the
 * middle. Written by hand, since a video of a code needs no library, and **made from the same drawing the app uses**, so that what the camera sees is what
 * the app would show another phone.
 */
export const CAMERA_PAYLOAD = 'https://example.com/members/scan-me-4711';

export function writeCameraVideo(path: string, payload = CAMERA_PAYLOAD): void {
  const width = 640;
  const height = 480;
  const modules = qrModules(payload);
  const quiet = 4;
  const side = modules.size + 2 * quiet;
  const scale = Math.floor(400 / side);
  const origin = {
    x: Math.floor((width - side * scale) / 2),
    y: Math.floor((height - side * scale) / 2),
  };
  const luma = Buffer.alloc(width * height, 235);
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++) {
      if (!modules.rows[y]?.[x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          luma[
            (origin.y + (y + quiet) * scale + dy) * width + origin.x + (x + quiet) * scale + dx
          ] = 16;
    }
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(path, Buffer.concat([header, ...Array.from({ length: 20 }, () => frame)]));
}
