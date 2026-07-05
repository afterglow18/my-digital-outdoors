/**
 * QuickAddSheet — new flow:
 *
 *   pick → preview → uploading (original) → bg-removing → done (close)
 *                                          ↘ bg-failed  → retry | keep original
 *
 * The original photo is uploaded immediately so the item appears in the
 * wardrobe without any delay.  Background removal runs afterward and, on
 * success, patches the item's imageObjectPath with the transparent PNG.
 * On failure the user can retry or keep the original as-is.
 */
import React, { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, RotateCcw, Check, X, Loader2, RefreshCw, ImageOff } from "lucide-react";
import {
  useCreateClothingItem,
  useUpdateClothingItem,
  getListClothingQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { processClothingImage, encodeToPng, TimeoutError } from "@/lib/processImage";

type Category = "tops" | "bottoms" | "shoes" | "accessories" | "outerwear" | "dresses";

const CATEGORY_LABELS: Record<Category, string> = {
  tops:        "Top",
  bottoms:     "Bottom",
  shoes:       "Shoes",
  accessories: "Accessory",
  outerwear:   "Outerwear",
  dresses:     "Dress",
};

type Phase =
  | "pick"          // waiting for photo
  | "preview"       // showing original photo, ready to save
  | "uploading"     // uploading original + creating DB record
  | "bg-removing"   // running bg removal; item already saved
  | "bg-failed";    // bg removal failed; item still saved with original

// ── Upload helper ─────────────────────────────────────────────────────────────

async function uploadBlob(blob: Blob, filename: string): Promise<string> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ name: filename, size: blob.size, contentType: "image/png" }),
  });
  if (!res.ok) throw new Error("Failed to request upload URL");

  const { uploadURL, objectPath } = (await res.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  const put = await fetch(uploadURL, {
    method:  "PUT",
    headers: { "Content-Type": "image/png" },
    body:    blob,
  });
  if (!put.ok) throw new Error("Failed to upload image");

  return objectPath;
}

// ── Simulated progress hook ────────────────────────────────────────────────────
// The library's resources.json is empty so real byte progress never fires.
// We animate a ramp that decelerates as it approaches 92%, then snaps to 100%.

function useSimulatedProgress(running: boolean) {
  const [pct, setPct] = useState(0);
  const raf = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!running) {
      if (raf.current) clearInterval(raf.current);
      setPct(0);
      return;
    }
    setPct(0);
    // Tick every 600 ms; decelerate as we approach 92 %
    raf.current = setInterval(() => {
      setPct((p) => {
        if (p >= 92) return p;
        const step = Math.max(0.4, (92 - p) * 0.045);
        return Math.min(92, p + step);
      });
    }, 600);
    return () => { if (raf.current) clearInterval(raf.current); };
  }, [running]);

  const finish = useCallback(() => {
    if (raf.current) clearInterval(raf.current);
    setPct(100);
  }, []);

  return { pct, finish };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface QuickAddSheetProps {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  category:      Category;
  existingCount: number;
}

export function QuickAddSheet({
  open,
  onOpenChange,
  category,
  existingCount,
}: QuickAddSheetProps) {
  const [phase,       setPhase]      = useState<Phase>("pick");
  const [previewUrl,  setPreviewUrl] = useState<string | null>(null);
  const [bgErrMsg,    setBgErrMsg]   = useState<string | null>(null);

  // Kept in refs so async callbacks always see the latest value without
  // causing extra re-renders.
  const originalFileRef  = useRef<File | null>(null);
  const originalPngRef   = useRef<Blob | null>(null);
  const savedItemIdRef   = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const createItem = useCreateClothingItem();
  const updateItem = useUpdateClothingItem();
  const queryClient = useQueryClient();

  const bgRunning = phase === "bg-removing";
  const { pct: bgPct, finish: bgFinish } = useSimulatedProgress(bgRunning);

  // ── Reset on close ──────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setPhase("pick");
    setBgErrMsg(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    originalFileRef.current  = null;
    originalPngRef.current   = null;
    savedItemIdRef.current   = null;
    onOpenChange(false);
  }, [previewUrl, onOpenChange]);

  // ── Background removal (runs after upload) ──────────────────────────────
  const runBgRemoval = useCallback(async (itemId: number) => {
    const file = originalFileRef.current;
    if (!file) return;

    setPhase("bg-removing");
    setBgErrMsg(null);

    try {
      const processed = await processClothingImage(file);
      const filename   = `${category}-processed-${Date.now()}.png`;
      const objectPath = await uploadBlob(processed, filename);

      await new Promise<void>((resolve, reject) => {
        updateItem.mutate(
          { id: itemId, data: { imageObjectPath: objectPath } },
          {
            onSuccess: () => resolve(),
            onError:   (e) => reject(e),
          },
        );
      });

      bgFinish();
      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      // Brief pause so the 100% bar is visible, then close
      setTimeout(handleClose, 400);
    } catch (err) {
      console.error("Background removal failed:", err);
      const isTimeout = err instanceof TimeoutError;
      setBgErrMsg(
        isTimeout
          ? "Removing the background took too long. Your item is saved — tap 'Try again' or keep the original."
          : "Background removal failed. Your item is saved — tap 'Try again' or keep the original.",
      );
      setPhase("bg-failed");
    }
  }, [category, bgFinish, updateItem, queryClient, handleClose]);

  // ── File selected → show preview ────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    originalFileRef.current = file;
    const url = URL.createObjectURL(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(url);
    setPhase("preview");
  }, [previewUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  // ── Save (upload original → create item → start bg removal) ────────────
  const handleSave = useCallback(async () => {
    const file = originalFileRef.current;
    if (!file) return;

    setPhase("uploading");

    try {
      // Encode to PNG (normalises JPEG from camera)
      const png = await encodeToPng(file);
      originalPngRef.current = png;

      const filename   = `${category}-${Date.now()}.png`;
      const objectPath = await uploadBlob(png, filename);

      const label    = CATEGORY_LABELS[category];
      const n        = existingCount + 1;
      const autoName = n === 1 ? label : `${label} ${n}`;

      await new Promise<void>((resolve, reject) => {
        createItem.mutate(
          { data: { name: autoName, category, imageObjectPath: objectPath } },
          {
            onSuccess: (data) => {
              savedItemIdRef.current = (data as { id: number }).id;
              queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
              resolve();
            },
            onError: reject,
          },
        );
      });

      // Item is in the wardrobe. Now attempt background removal.
      runBgRemoval(savedItemIdRef.current!);
    } catch (err) {
      console.error("Upload/create failed:", err);
      setBgErrMsg("Could not save the item. Please check your connection and try again.");
      setPhase("preview");
    }
  }, [category, existingCount, createItem, queryClient, runBgRemoval]);

  // ── Retry bg removal ────────────────────────────────────────────────────
  const handleRetryBg = useCallback(() => {
    const itemId = savedItemIdRef.current;
    if (itemId != null) runBgRemoval(itemId);
  }, [runBgRemoval]);

  // ── Retake photo ────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    originalFileRef.current = null;
    setPhase("pick");
    setTimeout(() => fileInputRef.current?.click(), 80);
  }, [previewUrl]);

  if (!open) return null;

  const label = CATEGORY_LABELS[category];

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b-2 border-black flex-shrink-0">
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Add {label}
        </h2>
        {/* Only allow close when not mid-upload */}
        {phase !== "uploading" && (
          <button
            onClick={handleClose}
            className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                       bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-hidden">
        <AnimatePresence mode="wait">

          {/* ── PICK ── */}
          {phase === "pick" && (
            <motion.div
              key="pick"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-6 w-full"
            >
              <div className="text-center">
                <p className="font-display font-bold text-2xl uppercase tracking-tight">
                  Take or Choose a Photo
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Background is removed automatically.
                </p>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-44 h-44 border-4 border-black rounded-3xl bg-primary
                           flex flex-col items-center justify-center gap-3
                           shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
                           hover:-translate-y-1 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)]
                           active:translate-y-1 active:translate-x-1 active:shadow-none transition-all"
              >
                <Camera className="w-14 h-14" strokeWidth={1.5} />
                <span className="font-display font-bold text-lg uppercase tracking-tight">
                  Open Camera
                </span>
              </button>

              <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed">
                Lay your {label.toLowerCase()} flat or hang it up for best results.
              </p>
            </motion.div>
          )}

          {/* ── PREVIEW ── */}
          {phase === "preview" && previewUrl && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-5 w-full"
            >
              <div
                className="w-52 h-52 border-4 border-black rounded-2xl overflow-hidden flex-shrink-0"
                style={{
                  backgroundImage:
                    "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                  backgroundSize: "20px 20px",
                }}
              >
                <img
                  src={previewUrl}
                  alt="Photo preview"
                  className="w-full h-full object-contain"
                />
              </div>

              {bgErrMsg && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200
                              rounded-lg px-3 py-2 text-center">
                  {bgErrMsg}
                </p>
              )}

              <p className="text-sm text-center text-muted-foreground">
                Saving will add the item instantly.
                Background removal runs after.
              </p>

              <div className="flex gap-3 w-full max-w-xs">
                <button
                  onClick={handleRetake}
                  className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2
                             font-bold uppercase text-sm border-2 border-black bg-white
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retake
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2
                             font-bold uppercase text-sm border-2 border-black bg-primary
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                >
                  <Check className="w-4 h-4" />
                  Save
                </button>
              </div>
            </motion.div>
          )}

          {/* ── UPLOADING ── */}
          {phase === "uploading" && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-5"
            >
              <div className="w-32 h-32 border-4 border-black rounded-3xl bg-white
                              flex flex-col items-center justify-center gap-2
                              shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <Loader2 className="w-10 h-10 animate-spin" strokeWidth={1.5} />
              </div>
              <p className="font-display font-bold text-xl uppercase tracking-tight">
                Saving…
              </p>
              <p className="text-sm text-muted-foreground text-center">
                Adding to your closet.
              </p>
            </motion.div>
          )}

          {/* ── BG-REMOVING ── */}
          {phase === "bg-removing" && (
            <motion.div
              key="bg-removing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 w-full"
            >
              <div className="w-32 h-32 border-4 border-black rounded-3xl bg-white
                              flex flex-col items-center justify-center gap-2
                              shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <Loader2 className="w-10 h-10 animate-spin" strokeWidth={1.5} />
              </div>

              <div className="text-center">
                <p className="font-display font-bold text-xl uppercase tracking-tight">
                  Removing Background…
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your item is already saved. This runs in the background.
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide
                                mb-1 text-black/40">
                  <span>Processing</span>
                  <span>{Math.round(bgPct)}%</span>
                </div>
                <div className="w-full h-3 bg-black/10 rounded-full border border-black/20 overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${bgPct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
                {bgPct < 15 && (
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    Downloading AI model on first use — cached afterwards.
                  </p>
                )}
              </div>

              {/* Escape hatch — let the user close; item is already saved */}
              <button
                onClick={handleClose}
                className="text-xs text-muted-foreground underline underline-offset-2 mt-2"
              >
                Close and keep original
              </button>
            </motion.div>
          )}

          {/* ── BG-FAILED ── */}
          {phase === "bg-failed" && (
            <motion.div
              key="bg-failed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-5 w-full max-w-xs"
            >
              <div className="w-20 h-20 border-4 border-black rounded-2xl bg-white
                              flex items-center justify-center
                              shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <ImageOff className="w-9 h-9" strokeWidth={1.5} />
              </div>

              <div className="text-center">
                <p className="font-display font-bold text-xl uppercase tracking-tight">
                  Background Removal Failed
                </p>
                {bgErrMsg && (
                  <p className="text-sm text-muted-foreground mt-2 leading-snug">
                    {bgErrMsg}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={handleRetryBg}
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2
                             font-bold uppercase text-sm border-2 border-black bg-primary
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2
                             font-bold uppercase text-sm border-2 border-black bg-white
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                >
                  <Check className="w-4 h-4" />
                  Keep Original
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Hidden file input — camera-first on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
    </motion.div>
  );
}
