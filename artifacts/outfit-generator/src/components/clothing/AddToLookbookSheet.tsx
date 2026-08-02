/**
 * AddToLookbookSheet — slide-up sheet that lets the user add or remove an item
 * from any of their saved kits (lookbooks).
 *
 * Each row shows a 3-thumbnail preview of the kit + the kit name.
 * A filled checkmark appears on kits that already contain this item.
 * Tapping a row toggles membership.
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { useListOutfits, useAddItemToOutfit, useRemoveItemFromOutfit, getListOutfitsQueryKey } from "@/hooks/useLocalDB";
import type { ClothingItem } from "@/lib/db";
import { getImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  item:    ClothingItem;
  onClose: () => void;
}

function ThreeThumbs({ items }: { items: ClothingItem[] }) {
  const shown = items.slice(0, 3);
  return (
    <div className="flex gap-1">
      {Array.from({ length: 3 }).map((_, i) => {
        const img = shown[i]?.imageObjectPath;
        return (
          <div
            key={i}
            className="w-10 h-10 border border-black/20 rounded overflow-hidden flex-shrink-0"
            style={{ background: "#F5EDD8" }}
          >
            {img ? (
              <img
                src={getImageUrl(img)!}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-[8px] text-black/20">—</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AddToLookbookSheet({ item, onClose }: Props) {
  const { data: outfits = [], isLoading } = useListOutfits();
  const addItem    = useAddItemToOutfit();
  const removeItem = useRemoveItemFromOutfit();
  const qc         = useQueryClient();

  // Optimistic local state for checked outfits
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  function isInOutfit(outfitId: number): boolean {
    if (outfitId in overrides) return overrides[outfitId];
    return outfits.find((o) => o.id === outfitId)?.items.some((i) => i.id === item.id) ?? false;
  }

  function toggle(outfitId: number) {
    const currently = isInOutfit(outfitId);
    // Optimistic update
    setOverrides((prev) => ({ ...prev, [outfitId]: !currently }));

    if (currently) {
      removeItem.mutate(
        { id: outfitId, itemId: item.id },
        { onSuccess: () => qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
      );
    } else {
      addItem.mutate(
        { id: outfitId, data: { itemId: item.id } },
        { onSuccess: () => qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
      );
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[90] flex flex-col max-w-md mx-auto bg-[#F5EFE4]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 bg-[#FAF6EE] border-b border-[#3A2210]/20 flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight text-[#3A2210]">
            Add to Kit
          </h2>
          <p className="text-xs text-[#6B4A2A]/60 mt-0.5">
            Tap a kit to add or remove this item
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 border rounded-full flex items-center justify-center
                     bg-[#FAF6EE] border-[#3A2210]/30 shadow-[2px_2px_0px_0px_rgba(58,34,16,0.18)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Kit list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-xl border border-[#3A2210]/10" />
            ))}
          </div>
        ) : outfits.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm font-medium text-[#6B4A2A]/50">No kits saved yet.</p>
            <p className="text-xs text-[#6B4A2A]/35 mt-1">
              Save a kit from the Generate tab first.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {outfits.map((outfit) => {
              const checked = isInOutfit(outfit.id);
              return (
                <button
                  key={outfit.id}
                  onClick={() => toggle(outfit.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all
                             active:scale-[0.98]"
                  style={{
                    borderColor: checked ? "#000" : "#C9BAA5",
                    background:  checked ? "hsl(24 100% 44% / 0.12)" : "#FFFDF8",
                    boxShadow:   checked ? "3px 3px 0px 0px rgba(0,0,0,0.8)" : "none",
                  }}
                >
                  <ThreeThumbs items={outfit.items} />
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold text-sm uppercase tracking-tight truncate text-[#2A1206]">
                      {outfit.name}
                    </p>
                    <p className="text-[10px] text-[#6B4A2A]/50 mt-0.5">
                      {outfit.items.length} item{outfit.items.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      borderColor: checked ? "#000" : "#C9BAA5",
                      background:  checked ? "#000" : "transparent",
                    }}
                  >
                    <AnimatePresence>
                      {checked && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                        >
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-3 bg-[#FAF6EE] border-t border-[#3A2210]/20 flex-shrink-0"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wide
                     border-2 border-black bg-black text-white
                     shadow-[3px_3px_0px_0px_rgba(0,0,0,0.4)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}
