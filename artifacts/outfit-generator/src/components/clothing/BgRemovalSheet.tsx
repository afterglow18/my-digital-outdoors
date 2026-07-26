/**
 * BgRemovalSheet
 *
 * Full-screen overlay that slides up showing the original image alongside
 * the background-removed version. The user taps a card to select it
 * (rose ring + checkmark), then taps the matching save button.
 *
 * onSave receives the chosen data URL — the parent is responsible for
 * writing it to the DB and updating local state optimistically.
 */
import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";

interface Props {
  /** Data URL of the unmodified image. */
  originalUrl: string;
  /** Data URL of the background-removed PNG. */
  cleanedUrl:  string;
  /** Called immediately when the user confirms — fire DB write in the background. */
  onSave:  (chosenUrl: string) => void;
  onClose: () => void;
}

export function BgRemovalSheet({ originalUrl, cleanedUrl, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<"original" | "cleaned">("cleaned");

  const RING_ACTIVE   = "3px solid #f43f5e";   // rose-500
  const RING_INACTIVE = "3px solid rgba(0,0,0,0.12)";

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[75] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Choose Version
        </h2>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
        <p className="text-center font-bold text-[11px] uppercase tracking-[0.15em] text-black/40">
          Tap a version to select it
        </p>

        {/* Side-by-side cards */}
        <div className="flex gap-3 flex-1">

          {/* Original */}
          <button
            onClick={() => setSelected("original")}
            className="flex-1 flex flex-col rounded-2xl overflow-hidden transition-all"
            style={{ border: selected === "original" ? RING_ACTIVE : RING_INACTIVE }}
          >
            <div className="flex-1 bg-black relative" style={{ minHeight: 260 }}>
              <img
                src={originalUrl}
                alt="Original"
                className="absolute inset-0 w-full h-full object-contain"
              />
              {selected === "original" && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-500 border-2 border-white
                                flex items-center justify-center shadow-sm">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
              )}
            </div>
            <div className="py-2 bg-white border-t-2 border-black flex-shrink-0">
              <p className="text-center font-bold text-[11px] uppercase tracking-wider">Original</p>
            </div>
          </button>

          {/* Cleaned */}
          <button
            onClick={() => setSelected("cleaned")}
            className="flex-1 flex flex-col rounded-2xl overflow-hidden transition-all"
            style={{ border: selected === "cleaned" ? RING_ACTIVE : RING_INACTIVE }}
          >
            <div
              className="flex-1 relative"
              style={{
                minHeight: 260,
                backgroundImage: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%)",
                backgroundSize: "12px 12px",
              }}
            >
              <img
                src={cleanedUrl}
                alt="Cleaned"
                className="absolute inset-0 w-full h-full object-contain"
              />
              {selected === "cleaned" && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-500 border-2 border-white
                                flex items-center justify-center shadow-sm">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
              )}
            </div>
            <div className="py-2 bg-white border-t-2 border-black flex-shrink-0">
              <p className="text-center font-bold text-[11px] uppercase tracking-wider">Cleaned ✨</p>
            </div>
          </button>

        </div>
      </div>

      {/* ── Footer — two save buttons; selected one gets the brutalist primary style ── */}
      <div
        className="px-4 py-4 bg-white border-t-2 border-black flex-shrink-0 flex gap-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => onSave(originalUrl)}
          className={[
            "flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wide border-2 border-black transition-all",
            selected === "original"
              ? "bg-primary shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              : "bg-white text-black/40",
          ].join(" ")}
        >
          Save Original
        </button>

        <button
          onClick={() => onSave(cleanedUrl)}
          className={[
            "flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wide border-2 border-black transition-all",
            selected === "cleaned"
              ? "bg-primary shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              : "bg-white text-black/40",
          ].join(" ")}
        >
          Save Cleaned ✨
        </button>
      </div>
    </motion.div>
  );
}
