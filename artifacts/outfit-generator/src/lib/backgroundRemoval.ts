import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

/**
 * One-time ORT configuration — must run before the first imgly call.
 *
 * Why dynamic import?
 *   Importing onnxruntime-web at module parse time triggers Vite's dependency
 *   pre-bundling mid-session, causing a full page reload that corrupts React's
 *   internal dispatcher. Importing it here, inside the function, means it only
 *   loads the moment inference is first requested — after everything is stable.
 *
 * Why Object.defineProperty instead of assignment?
 *   @imgly/background-removal sets `ort.env.wasm.proxy = false` internally right
 *   before creating the ONNX session (it only enables the proxy when WebGPU is
 *   available, which it isn't on iOS Safari / WKWebView). A plain assignment would
 *   be overwritten. A non-configurable getter+no-op-setter freezes the value at
 *   `true` so ONNX Runtime actually runs inference in a sub-worker, freeing the
 *   main thread.
 *
 * Why numThreads = 1?
 *   iOS Safari has no SharedArrayBuffer, which WASM multithreading requires.
 *   Leaving threads > 1 causes a silent crash.
 */
let ortConfigured = false;
async function configureOrt() {
  if (ortConfigured) return;
  ortConfigured = true;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — onnxruntime-web types.d.ts exists but isn't reachable via package.json "exports"
  const ort = await import("onnxruntime-web");
  Object.defineProperty(ort.env.wasm, "proxy", {
    get: () => true,
    set: () => {},   // blocks imgly from setting it back to false
    configurable: true,
  });
  ort.env.wasm.numThreads = 1;
}

/**
 * Remove the background from a JPEG/PNG base64 data-URL.
 * Returns a PNG data-URL with transparent background.
 *
 * On the first call:
 *   1. Configures ONNX Runtime to run in a Web Worker (main thread stays responsive)
 *   2. Downloads ~15 MB ONNX model from the imgly CDN (cached in the browser after that)
 *
 * Throws on network error or unreadable image — callers should catch and show a retry UI.
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  await configureOrt();
  const sourceBlob = await dataUrlToBlob(dataUrl);
  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    model: "isnet_fp16", // valid: "isnet" | "isnet_fp16" | "isnet_quint8" — NOT "small"/"medium"
    output: { format: "image/png", quality: 0.9 },
    // publicPath omitted → uses static imgly CDN automatically
  });
  return blobToDataUrl(resultBlob);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
