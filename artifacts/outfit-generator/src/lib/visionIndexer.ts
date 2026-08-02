/**
 * visionIndexer — background photo-search indexer.
 *
 * On app start, finds all items that haven't been analyzed yet and processes
 * them one-at-a-time with a 350 ms delay so the UI stays responsive.
 *
 * Platform behaviour:
 *   iOS native  — runs VisionAnalyzer plugin (object labels + OCR text) AND
 *                 canvas color extraction in parallel, then merges the label
 *                 arrays.  Sets visionVersion = 2.
 *   Browser/web — extracts dominant colors via a 48×48 canvas.
 *                 Sets visionVersion = 4 (labels found) or 5 (no labels).
 *
 * Newly added / updated items are queued for immediate analysis without
 * waiting for the next launch.
 *
 * Usage:
 *   import { startVisionIndexer, queueItemForIndex } from "@/lib/visionIndexer";
 *   startVisionIndexer(); // call once from App.tsx
 */

import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { listItemsNeedingVisionIndex, updateVisionFields } from "@/lib/localDB";
import { extractColorLabels } from "@/lib/visionWeb";
import { analyzeImageNative } from "@/lib/visionNative";
import { queryClient } from "@/lib/queryClient";

const BATCH_DELAY_MS = 350;
const isNative = Capacitor.isNativePlatform();

// Pending queue for newly added items
const pending = new Set<number>();
let running  = false;
let started  = false;

async function processItem(id: number, imageDataUrl: string): Promise<void> {
  if (isNative) {
    // Run Vision object/OCR analysis and canvas color extraction in parallel.
    // Apple's VNClassifyImageRequest returns object types ("shoe", "high heel")
    // but never color names — canvas extraction fills that gap.
    const [{ labels: visionLabels, text }, colorLabels] = await Promise.all([
      analyzeImageNative(imageDataUrl),
      extractColorLabels(imageDataUrl).catch(() => [] as string[]),
    ]);
    const merged = Array.from(new Set([...visionLabels, ...colorLabels]));
    await updateVisionFields(id, {
      visionLabels:  merged,
      visionText:    text,
      visionVersion: 2,
    });
  } else {
    const labels = await extractColorLabels(imageDataUrl);
    await updateVisionFields(id, {
      visionLabels:  labels,
      visionText:    [],
      visionVersion: labels.length > 0 ? 4 : 5,
    });
  }
}

async function runQueue(items: Array<{ id: number; imageObjectPath: string }>): Promise<void> {
  if (running || items.length === 0) return;
  running = true;

  const toastId = toast.loading("Preparing photo search…", { duration: Infinity });

  try {
    for (const item of items) {
      if (!item.imageObjectPath) continue;
      try {
        await processItem(item.id, item.imageObjectPath);
        // Invalidate so search results pick up new labels immediately
        queryClient.invalidateQueries({ queryKey: ["clothing"] });
      } catch (err) {
        console.warn(`[VisionIndexer] Failed for item ${item.id}:`, err);
      }
      await new Promise<void>((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  } finally {
    running = false;
    toast.dismiss(toastId);
  }
}

/** Call once at app startup. Safe to call multiple times — only runs once. */
export async function startVisionIndexer(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const items = await listItemsNeedingVisionIndex(isNative);
    if (items.length === 0) return;

    console.log(`[VisionIndexer] ${items.length} item(s) to index (native=${isNative})`);

    await runQueue(
      items.map((i) => ({ id: i.id, imageObjectPath: i.imageObjectPath! }))
    );
  } catch (err) {
    console.warn("[VisionIndexer] Error during startup indexing:", err);
  }
}

/**
 * Queue a single item for immediate analysis (call after adding/updating a photo).
 * Safe to call while the startup batch is still running.
 */
export function queueItemForIndex(id: number, imageObjectPath: string): void {
  if (pending.has(id)) return;
  pending.add(id);

  setTimeout(async () => {
    pending.delete(id);
    try {
      await processItem(id, imageObjectPath);
      queryClient.invalidateQueries({ queryKey: ["clothing"] });
    } catch (err) {
      console.warn(`[VisionIndexer] Immediate queue failed for item ${id}:`, err);
    }
  }, 200);
}
