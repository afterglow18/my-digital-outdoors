/**
 * QuickAddSheet
 *
 * Upload flow with on-device background removal:
 *   pick ──(file chosen)──► encoding ──► preview (Original | Cleaned ✨) ──► uploading ──► close
 *
 * IMPORTANT: phase blocks must NOT be wrapped in AnimatePresence.
 * Any AnimatePresence wrapper creates exit-animation windows where no child is
 * mounted — blank screen between every phase change regardless of mode/transition.
 * The outer sheet can still use motion.div for the slide-in.
 */
import React, { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Check, RotateCcw } from "lucide-react";
import {
  useCreateClothingItem,
  getListClothingQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import { removeBackground, blobToDataUrl, dataUrlToBlob } from "@/lib/backgroundRemoval";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "outfits" | "beauty" | "toiletries" | "essentials";

const CATEGORY_LABELS: Record<Category, string> = {
  outfits:    "Gear",
  beauty:     "Equipment",
  toiletries: "Supplies",
  essentials: "Accessories",
};

type Phase = "pick" | "encoding" | "preview" | "uploading";

// ── Module-level helpers ────────────────────────────────────────────────────────

/**
 * Resize any image file to ≤2048px JPEG.
 * Called immediately after the user picks a photo so the canvas encode
 * runs before bg-removal — keeps the model input fast.
 */
async function encodeForUpload(input: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(input);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX   = 2048;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w     = Math.round(img.naturalWidth  * scale);
      const h     = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => (b && b.size > 1000 ? resolve(b) : reject(new Error("blank image"))),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("failed to load image"));
    };
    img.src = objectUrl;
  });
}

/**
 * Convert a blob to a storage data URL.
 * Shrinks to ≤800px; preserves PNG transparency, converts everything else to JPEG.
 */
async function toStorageDataUrl(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX   = 800;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w     = Math.round(img.naturalWidth  * scale);
      const h     = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const isPng = blob.type === "image/png";
      resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", isPng ? undefined : 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load failed")); };
    img.src = url;
  });
}

// ── Static content ─────────────────────────────────────────────────────────────

const PHOTO_TIPS = [
  "Lay everything flat on a plain background.",
  "Take the photo from directly above.",
  "Keep all items fully in frame.",
] as const;


// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  category:      Category;
  existingCount: number;
  onCreated?:    (item: import("@/lib/db").ClothingItem) => void;
}

export function QuickAddSheet({ open, onOpenChange, category, existingCount, onCreated }: Props) {
  // ── State per spec ────────────────────────────────────────────────────────
  const [phase,          setPhase]          = useState<Phase>("pick");
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null);
  const [originalBlob,   setOriginalBlob]   = useState<Blob | null>(null);
  const [originalUrl,    setOriginalUrl]    = useState<string | null>(null);
  const [cleanedBlob,    setCleanedBlob]    = useState<Blob | null>(null);
  const [cleanedUrl,     setCleanedUrl]     = useState<string | null>(null);
  const [bgProcessing,   setBgProcessing]   = useState(false);
  const [bgFailed,       setBgFailed]       = useState(false);
  const [selected,       setSelected]       = useState<"original" | "cleaned">("original");
  const [batchProgress,  setBatchProgress]  = useState<{ current: number; total: number } | null>(null);

  // Each photo bumps this counter. Every async step checks it before writing
  // state — prevents a slow first photo from clobbering a fast second one.
  const bgGenRef = useRef(0);

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  // ── Reset / close ─────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    bgGenRef.current += 1;   // cancels any in-flight removal
    setBgProcessing(false);  // MUST reset — close can happen mid-removal
    setPhase("pick");
    setErrorMsg(null);
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setSelected("original");
    onOpenChange(false);
  }, [onOpenChange]);

  // ── Handle a single picked file ───────────────────────────────────────────
  const handleFile = useCallback(async (file: File | Blob) => {
    setErrorMsg(null);
    // Switch to "encoding" BEFORE any async work so user sees a spinner
    // immediately instead of sitting on the blank pick screen for 1–3 s.
    const myGen = ++bgGenRef.current;
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setBgProcessing(false);
    setSelected("original");
    setPhase("encoding");

    // Encode to JPEG ≤ 2048px
    let jpeg: Blob;
    try {
      jpeg = await encodeForUpload(file);
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      setErrorMsg(`Could not read the photo: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("pick");
      return;
    }
    if (bgGenRef.current !== myGen) return;

    // Show original, switch to comparison screen
    setOriginalBlob(jpeg);
    setOriginalUrl(URL.createObjectURL(jpeg));
    setPhase("preview");

    // Background removal — generation guard discards stale results
    setBgProcessing(true);
    try {
      const dataUrl   = await blobToDataUrl(jpeg);
      if (bgGenRef.current !== myGen) return;
      const resultUrl = await removeBackground(dataUrl);
      if (bgGenRef.current !== myGen) return;
      const resultBlob   = await dataUrlToBlob(resultUrl);
      const resultObjUrl = URL.createObjectURL(resultBlob);
      if (bgGenRef.current !== myGen) { URL.revokeObjectURL(resultObjUrl); return; }
      setCleanedBlob(resultBlob);
      setCleanedUrl(resultObjUrl);
      setSelected("cleaned");
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.warn("Background removal failed:", err);
      setBgFailed(true);
    } finally {
      if (bgGenRef.current === myGen) setBgProcessing(false);
    }
  }, []);

  // ── Save chosen version to DB ─────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const blob = selected === "cleaned" && cleanedBlob ? cleanedBlob : originalBlob;
    if (!blob) return;
    setPhase("uploading");
    try {
      const storageUrl = await toStorageDataUrl(blob);
      const label      = CATEGORY_LABELS[category];
      const n          = existingCount + 1;
      const autoName   = n === 1 ? label : `${label} ${n}`;
      await new Promise<void>((resolve, reject) => {
        createItem.mutate(
          { data: { name: autoName, category, imageObjectPath: storageUrl } },
          {
            onSuccess: (createdItem) => {
              queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
              queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
              if (onCreated) onCreated(createdItem);
              resolve();
            },
            onError: reject,
          },
        );
      });
      handleClose();
    } catch (err) {
      setErrorMsg(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("preview");
    }
  }, [selected, cleanedBlob, originalBlob, category, existingCount, createItem, queryClient, onCreated, handleClose]);

  // ── Batch save (multiple files — runs bg removal on each, then saves) ────
  const handleBatch = useCallback(async (files: File[]) => {
    setErrorMsg(null);
    setPhase("uploading");
    setBatchProgress({ current: 0, total: files.length });

    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setBatchProgress({ current: i + 1, total: files.length });
      try {
        const jpeg       = await encodeForUpload(files[i]);
        // Run background removal on every photo, same as single-file flow
        const dataUrl    = await blobToDataUrl(jpeg);
        const resultUrl  = await removeBackground(dataUrl);
        const cleanedBlob = await dataUrlToBlob(resultUrl);
        const storageUrl = await toStorageDataUrl(cleanedBlob);
        const label      = CATEGORY_LABELS[category];
        const n          = existingCount + i + 1;
        const autoName   = n === 1 ? label : `${label} ${n}`;
        await new Promise<void>((resolve, reject) => {
          createItem.mutate(
            { data: { name: autoName, category, imageObjectPath: storageUrl } },
            {
              onSuccess: (createdItem) => {
                queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
                queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
                if (onCreated) onCreated(createdItem);
                resolve();
              },
              onError: reject,
            },
          );
        });
      } catch (err) {
        console.error("Batch upload failed for file", i, err);
        failed++;
      }
    }

    setBatchProgress(null);
    if (failed > 0) {
      setErrorMsg(`${failed} photo${failed > 1 ? "s" : ""} could not be saved. Please try again.`);
      setPhase("pick");
    } else {
      handleClose();
    }
  }, [category, existingCount, createItem, queryClient, onCreated, handleClose]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 1) {
      handleFile(files[0]);   // → comparison flow
    } else if (files.length > 1) {
      handleBatch(files);     // → batch save, no comparison
    }
    e.target.value = "";
  };

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
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Add {label}
        </h2>
        {(phase === "pick" || phase === "preview") && (
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

      {/* ── Body — NO AnimatePresence: plain conditional divs per spec ── */}
      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* ── PICK ── */}
        {phase === "pick" && (
          <div className="flex flex-col p-5 gap-5">
            {errorMsg && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}

            <div className="flex gap-3">
              {/* Take Photo */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                           border-4 border-black rounded-2xl bg-primary
                           shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-1 active:translate-y-1 active:shadow-none
                           transition-all"
              >
                <span className="text-4xl leading-none">📷</span>
                <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                  Take<br />Photo
                </span>
              </button>

              {/* Upload Photo */}
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                           border-4 border-black rounded-2xl bg-white
                           shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-1 active:translate-y-1 active:shadow-none
                           transition-all"
              >
                <span className="text-4xl leading-none">🖼️</span>
                <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                  Upload<br />Photo
                </span>
              </button>
            </div>

            {/* Multi-select hint */}
            <p className="text-center text-xs text-black/40 font-medium -mt-2">
              Select one photo to preview &amp; remove background, or select multiple to clean &amp; save all at once.
            </p>

            {/* Photo tips */}
            <div className="border-2 border-black rounded-2xl bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <p className="font-display font-bold text-sm uppercase tracking-tight mb-3 flex items-center gap-2">
                <span>📸</span> PHOTO TIPS
              </p>
              <ul className="flex flex-col gap-2">
                {PHOTO_TIPS.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-sm text-black/70 leading-snug">
                    <span className="mt-0.5 w-4 h-4 border-2 border-black rounded-sm bg-primary
                                     flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── ENCODING — full-screen spinner shown immediately after pick ── */}
        {phase === "encoding" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white
                            flex items-center justify-center
                            shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight">Processing…</p>
              <p className="text-sm text-muted-foreground mt-1">Getting your photo ready.</p>
            </div>
          </div>
        )}

        {/* ── PREVIEW — side-by-side comparison ── */}
        {phase === "preview" && (
          <div className="flex flex-col gap-4 p-5">
            {errorMsg && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}

            <p className="text-center font-bold text-[11px] uppercase tracking-[0.15em] text-black/40">
              {bgProcessing
                ? "Removing background… this may take a moment"
                : bgFailed
                  ? "Background removal unavailable"
                  : "Tap to choose a version"}
            </p>

            {/* Cards */}
            <div className="flex gap-3">
              {/* Original */}
              <button
                onClick={() => setSelected("original")}
                className="flex-1 rounded-2xl overflow-hidden transition-all"
                style={{
                  border: selected === "original"
                    ? "3px solid black"
                    : "3px solid rgba(0,0,0,0.15)",
                }}
              >
                <div className="bg-black relative" style={{ minHeight: 176 }}>
                  <img
                    src={originalUrl!}
                    alt="Original"
                    className="w-full object-contain block"
                    style={{ maxHeight: 176 }}
                  />
                  {selected === "original" && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black
                                    flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="text-center font-bold text-[11px] uppercase tracking-wider py-1.5 bg-white m-0">
                  Original
                </p>
              </button>

              {/* Cleaned */}
              <button
                onClick={() => cleanedUrl && setSelected("cleaned")}
                disabled={!cleanedUrl}
                className="flex-1 rounded-2xl overflow-hidden transition-all"
                style={{
                  border: selected === "cleaned" && cleanedUrl
                    ? "3px solid black"
                    : "3px solid rgba(0,0,0,0.15)",
                }}
              >
                {/* Checkerboard reveals transparency */}
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px",
                    minHeight: 176,
                  }}
                >
                  {cleanedUrl ? (
                    <>
                      <img
                        src={cleanedUrl}
                        alt="Cleaned"
                        className="w-full object-contain block"
                        style={{ maxHeight: 176 }}
                      />
                      {selected === "cleaned" && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black
                                        flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        </div>
                      )}
                    </>
                  ) : bgFailed ? (
                    <p className="text-xs font-bold uppercase text-black/40 text-center px-3 py-4">
                      Could not remove background
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-6">
                      <Loader2 className="w-8 h-8 animate-spin text-black/40" />
                      <p className="text-xs font-bold uppercase text-black/50 m-0">Processing</p>
                    </div>
                  )}
                </div>
                <p className="text-center font-bold text-[11px] uppercase tracking-wider py-1.5 bg-white m-0">
                  Cleaned ✨
                </p>
              </button>
            </div>

            {/* Action row */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPhase("pick")}
                className="flex items-center justify-center gap-2 px-4 py-3
                           border-2 border-black rounded-xl bg-white font-bold text-sm uppercase tracking-wide
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Retake
              </button>
              <button
                onClick={handleSave}
                disabled={selected === "cleaned" && !cleanedUrl}
                className="flex-1 flex items-center justify-center gap-2 py-3
                           border-2 border-black rounded-xl bg-primary font-bold text-sm uppercase tracking-wide
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-[3px] active:translate-y-[3px] active:shadow-none
                           transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <Check className="w-4 h-4" />
                {selected === "cleaned" && !cleanedUrl ? "Processing…" : "Save to Kit"}
              </button>
            </div>
          </div>
        )}

        {/* ── UPLOADING ── */}
        {phase === "uploading" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white
                            flex items-center justify-center
                            shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight">Saving…</p>
              <p className="text-sm text-muted-foreground mt-1">
                {batchProgress && batchProgress.total > 1
                  ? `Photo ${batchProgress.current} of ${batchProgress.total}`
                  : "Adding to your kit."}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Camera — single shot, goes through comparison flow */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      {/* Gallery — supports multiple; 1 file → comparison, 2+ → batch save */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
    </motion.div>
  );
}
