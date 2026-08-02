/**
 * visionNative — Capacitor bridge to the native iOS VisionAnalyzer plugin.
 *
 * The plugin runs VNClassifyImageRequest + VNRecognizeTextRequest on a
 * background queue and returns labels + recognized text to the web layer.
 * Falls back silently to empty arrays on any error, including when running
 * in the browser where no native plugin is available.
 */

import { registerPlugin } from "@capacitor/core";

interface VisionAnalyzerPlugin {
  analyze(options: { imageDataUrl: string }): Promise<{
    labels: string[];
    text:   string[];
  }>;
}

// Registers the bridge. On web, the fallback implementation returns empty
// arrays immediately so callers don't need to branch on platform.
const VisionAnalyzer = registerPlugin<VisionAnalyzerPlugin>("VisionAnalyzer", {
  web: async () => ({ labels: [], text: [] }),
});

export async function analyzeImageNative(imageDataUrl: string): Promise<{
  labels: string[];
  text:   string[];
}> {
  try {
    return await VisionAnalyzer.analyze({ imageDataUrl });
  } catch (err) {
    console.warn("[VisionNative] analyze failed:", err);
    return { labels: [], text: [] };
  }
}
