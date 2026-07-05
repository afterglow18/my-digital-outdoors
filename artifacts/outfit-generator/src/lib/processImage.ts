/**
 * Removes the background from a clothing photo, then crops and centers
 * the subject on a square transparent-PNG canvas.
 *
 * Uses @imgly/background-removal (browser-side, no API key needed).
 * Model files are streamed from the jsDelivr CDN on first call and
 * cached by the browser thereafter.
 *
 * NOTE: The library's resources.json ships empty, so the built-in
 * progress callback never fires with total > 0.  Callers should drive
 * their own progress UI (e.g. a simulated ramp) independently and treat
 * onProgress here as a best-effort supplement only.
 */
import { removeBackground } from "@imgly/background-removal";

const CDN_VERSION = "1.7.0";
const PUBLIC_PATH = `https://cdn.jsdelivr.net/npm/@imgly/background-removal@${CDN_VERSION}/dist/web/`;

export type ProgressCallback = (percent: number) => void;

/** Wraps a promise with a hard timeout; rejects with TimeoutError on expiry. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Background removal timed out after ${ms / 1000}s`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

/**
 * Encode a File/Blob as a PNG via canvas (normalises camera JPEGs).
 * Returns a transparent-friendly PNG Blob.
 */
export async function encodeToPng(input: File | Blob): Promise<Blob> {
  const url = URL.createObjectURL(input);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = url;
    });
    const cvs = document.createElement("canvas");
    cvs.width  = img.naturalWidth;
    cvs.height = img.naturalHeight;
    cvs.getContext("2d")!.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      cvs.toBlob(
        (b) => (b ? res(b) : rej(new Error("canvas.toBlob failed"))),
        "image/png",
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Full pipeline: bg-removal → crop → pad to square transparent PNG.
 * Rejects with TimeoutError after `timeoutMs` (default 90 s).
 */
export async function processClothingImage(
  input: File | Blob,
  onProgress?: ProgressCallback,
  timeoutMs = 90_000,
): Promise<Blob> {
  const run = async () => {
    // Phase 1 – background removal
    const bgFree = await removeBackground(input, {
      publicPath: PUBLIC_PATH,
      model: "isnet_quint8",
      output: { format: "image/png", quality: 1 },
      // progress fires with total=0 due to empty resources.json —
      // we call onProgress anyway so callers can use it as a pulse.
      progress: (_key: string, current: number, total: number) => {
        if (onProgress) {
          onProgress(total > 0 ? Math.min(80, Math.round((current / total) * 80)) : -1);
        }
      },
    });

    onProgress?.(-1); // pulse: inference done, cropping next

    // Phase 2 – crop + pad to square
    const result = await cropAndCenterPng(bgFree);
    return result;
  };

  return withTimeout(run(), timeoutMs);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function cropAndCenterPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);

  const analysisCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = analysisCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const { data, width, height } = imageData;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        hasContent = true;
      }
    }
  }

  if (!hasContent) return blob;

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const pad   = Math.round(Math.max(cropW, cropH) * 0.06);
  const size  = Math.max(cropW, cropH) + pad * 2;

  const out    = new OffscreenCanvas(size, size);
  const outCtx = out.getContext("2d") as OffscreenCanvasRenderingContext2D;

  outCtx.drawImage(
    analysisCanvas,
    minX, minY, cropW, cropH,
    Math.round((size - cropW) / 2),
    Math.round((size - cropH) / 2),
    cropW, cropH,
  );

  return out.convertToBlob({ type: "image/png", quality: 1 });
}
