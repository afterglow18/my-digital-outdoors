/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 *
 * Props:
 *   showAddToLookbook — when true, shows "Add to Kit" instead of "Clean Up Photo"
 *                       as the second action button. Pass true from search results
 *                       and favorites; false (default) from the main wardrobe.
 */
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, Trash2, Save, ChevronDown, Loader2, Wand2, Footprints, Bookmark,
} from "lucide-react";
import { removeBackground } from "@/lib/backgroundRemoval";
import { BgRemovalSheet } from "./BgRemovalSheet";
import { AddToLookbookSheet } from "./AddToLookbookSheet";
import {
  type ClothingItem,
  type ClothingItemUpdateCategory,
  useUpdateClothingItem,
  useDeleteClothingItem,
  getListClothingQueryKey,
  getListOutfitsQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEASON_OPTIONS    = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS  = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS  = [
  { value: "outfits",    label: "Gear"        },
  { value: "beauty",     label: "Equipment"   },
  { value: "toiletries", label: "Supplies"    },
  { value: "essentials", label: "Accessories" },
];

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-[#6B4A2A]/70">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full border border-[#3A2210]/30 rounded-lg px-3 py-2 text-sm font-medium
                   bg-[#FFFDF8] text-[#2A1206] focus:outline-none focus:ring-2 focus:ring-primary
                   placeholder:font-normal placeholder:text-[#6B4A2A]/35"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<string | { value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-[#6B4A2A]/70">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border border-[#3A2210]/30 rounded-lg px-3 py-2 pr-8
                     text-sm font-medium bg-[#FFFDF8] text-[#2A1206] focus:outline-none focus:ring-2 focus:ring-primary
                     cursor-pointer"
        >
          {options.map((o) => {
            const val = typeof o === "string" ? o : o.value;
            const lbl = typeof o === "string" ? (o || `— ${label} —`) : o.label;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/40" />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item:              ClothingItem | null;
  onClose:           () => void;
  onDeleted?:        () => void;
  /** When true: "Add to Kit" replaces "Clean Up Photo" as the second action button. */
  showAddToLookbook?: boolean;
}

interface FormState {
  name: string; brand: string; color: string; size: string;
  season: string; occasion: string; purchasePrice: string;
  purchaseDate: string; notes: string; isFavorite: boolean; category: string;
}

function toForm(item: ClothingItem): FormState {
  return {
    name:          item.name          ?? "",
    brand:         item.brand         ?? "",
    color:         item.color         ?? "",
    size:          item.size          ?? "",
    season:        item.season        ?? "",
    occasion:      item.occasion      ?? "",
    purchasePrice: item.purchasePrice ?? "",
    purchaseDate:  item.purchaseDate  ?? "",
    notes:         item.notes         ?? "",
    isFavorite:    item.isFavorite    ?? false,
    category:      item.category      ?? "",
  };
}

function isDirty(form: FormState, item: ClothingItem): boolean {
  return (
    form.name          !== (item.name          ?? "") ||
    form.brand         !== (item.brand         ?? "") ||
    form.color         !== (item.color         ?? "") ||
    form.size          !== (item.size          ?? "") ||
    form.season        !== (item.season        ?? "") ||
    form.occasion      !== (item.occasion      ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") ||
    form.purchaseDate  !== (item.purchaseDate  ?? "") ||
    form.notes         !== (item.notes         ?? "") ||
    form.isFavorite    !== (item.isFavorite    ?? false) ||
    form.category      !== (item.category      ?? "")
  );
}

export function ItemDetailsSheet({
  item, onClose, onDeleted, showAddToLookbook = false,
}: ItemDetailsSheetProps) {
  const [form, setForm]                   = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Wearing Today ────────────────────────────────────────────────────────────
  const [wornToday, setWornToday] = useState(false);

  // ── Add to Kit sheet ─────────────────────────────────────────────────────────
  const [showLookbookPicker, setShowLookbookPicker] = useState(false);

  // ── Background removal state ──────────────────────────────────────────────
  const [bgRemoving,    setBgRemoving]    = useState(false);
  const [bgPreviewDUrl, setBgPreviewDUrl] = useState<string | null>(null);
  const [bgFailed,      setBgFailed]      = useState(false);
  const [showBgSheet,   setShowBgSheet]   = useState(false);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();
  const bgGenRef    = React.useRef(0);

  useEffect(() => {
    if (item) setForm(toForm(item));
    setShowDeleteConfirm(false);
    setBgRemoving(false);
    setBgPreviewDUrl(null);
    setBgFailed(false);
    setShowBgSheet(false);
    setLocalImageUrl(null);
    setWornToday(false);
  }, [item?.id]);

  // ── Wearing Today ──────────────────────────────────────────────────────────
  const handleWearingToday = useCallback(() => {
    if (!item || wornToday) return;
    setWornToday(true);
    updateItem.mutate(
      { id: item.id, data: { timesWorn: (item.timesWorn ?? 0) + 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          toast.success("Worn today! 🥾");
        },
      }
    );
  }, [item, wornToday, updateItem, queryClient]);

  // ── Background removal ─────────────────────────────────────────────────────
  const handleRemoveBg = useCallback(async () => {
    if (!item?.imageObjectPath) return;
    setBgFailed(false);
    setBgPreviewDUrl(null);
    setShowBgSheet(true);
    setBgRemoving(true);
    const gen = ++bgGenRef.current;
    try {
      const source        = localImageUrl ?? item.imageObjectPath;
      const resultDataUrl = await removeBackground(source);
      if (gen !== bgGenRef.current) return;
      setBgPreviewDUrl(resultDataUrl);
    } catch (err) {
      if (gen !== bgGenRef.current) return;
      console.warn("BG removal failed:", err);
      setBgFailed(true);
      setShowBgSheet(false);
    } finally {
      if (gen === bgGenRef.current) setBgRemoving(false);
    }
  }, [item?.imageObjectPath, localImageUrl]);

  const handleBgSave = useCallback((chosenUrl: string) => {
    bgGenRef.current++;
    setLocalImageUrl(chosenUrl);
    setShowBgSheet(false);
    setBgPreviewDUrl(null);
    updateItem.mutate(
      { id: item?.id ?? 0, data: { imageObjectPath: chosenUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
        },
      }
    );
  }, [item?.id, updateItem, queryClient]);

  // ── Early return — all hooks above this line ──────────────────────────────
  if (!item || !form) return null;

  const dirty = isDirty(form, item);
  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  const handleSave = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          name:          form.name.trim() || item.name,
          brand:         form.brand.trim(),
          color:         form.color.trim(),
          size:          form.size.trim(),
          season:        form.season,
          occasion:      form.occasion,
          purchasePrice: form.purchasePrice.trim(),
          purchaseDate:  form.purchaseDate.trim(),
          notes:         form.notes.trim(),
          isFavorite:    form.isFavorite,
          category:      (form.category || item.category) as ClothingItemUpdateCategory,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onClose();
        },
      }
    );
  };

  const handleDelete = () => {
    deleteItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onDeleted?.();
          onClose();
        },
      }
    );
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[65] flex flex-col max-w-md mx-auto bg-[#F5EFE4] overflow-y-auto"
    >
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4
                      bg-[#FAF6EE] border-b border-[#3A2210]/20 flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}>
        <h2 className="font-display font-bold text-xl uppercase tracking-tight text-[#3A2210]">
          Item Details
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = !form.isFavorite;
              patch("isFavorite")(next);
              updateItem.mutate(
                { id: item.id, data: { isFavorite: next } },
                {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
                  },
                }
              );
            }}
            className={`w-9 h-9 border rounded-full flex items-center justify-center transition-all
                        ${form.isFavorite
                          ? "bg-red-400 border-red-500/60 shadow-[2px_2px_0px_0px_rgba(58,34,16,0.25)]"
                          : "bg-[#FAF6EE] border-[#3A2210]/30 shadow-[2px_2px_0px_0px_rgba(58,34,16,0.18)]"}`}
            title="Favourite"
          >
            <Heart
              className="w-4 h-4"
              fill={form.isFavorite ? "white" : "none"}
              stroke={form.isFavorite ? "white" : "currentColor"}
            />
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 border rounded-full flex items-center justify-center
                       bg-[#FAF6EE] border-[#3A2210]/30 shadow-[2px_2px_0px_0px_rgba(58,34,16,0.18)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Photo ── */}
      {item.imageObjectPath && (
        <div className="flex-shrink-0 border-b border-[#3A2210]/20">
          <div
            className="w-full h-52 relative"
            style={{
              backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
              backgroundSize: "16px 16px",
            }}
          >
            <img
              src={localImageUrl ?? getImageUrl(item.imageObjectPath)!}
              alt={item.name}
              className="w-full h-full object-contain"
            />
            {bgRemoving && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
                <p className="text-white font-bold text-xs uppercase tracking-wider">
                  Removing background…
                </p>
                <p className="text-white/60 text-[11px]">This may take a moment</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Action bar — always shown, exactly 2 buttons ── */}
      <div className={`flex flex-shrink-0 ${item.imageObjectPath ? "" : "border-t border-[#3A2210]/15"}`}
           style={{ borderBottom: "1px solid rgba(58,34,16,0.15)" }}>
        {/* Left: Wearing Today */}
        <button
          onClick={handleWearingToday}
          disabled={wornToday}
          className="flex-1 py-2.5 flex items-center justify-center gap-1.5
                     text-[11px] font-bold uppercase tracking-wider
                     disabled:opacity-60 active:bg-[#F0E8D8] transition-colors"
          style={{ color: wornToday ? "#6B9E6B" : "#6B4A2A" }}
        >
          <Footprints className="w-3.5 h-3.5" />
          {wornToday ? "Worn Today ✓" : "Wearing Today"}
        </button>

        {/* Divider */}
        <div className="w-px" style={{ background: "rgba(58,34,16,0.15)" }} />

        {/* Right: context button */}
        {showAddToLookbook ? (
          <button
            onClick={() => setShowLookbookPicker(true)}
            className="flex-1 py-2.5 flex items-center justify-center gap-1.5
                       text-[11px] font-bold uppercase tracking-wider text-[#6B4A2A]
                       active:bg-[#F0E8D8] transition-colors"
          >
            <Bookmark className="w-3.5 h-3.5" />
            Add to Kit
          </button>
        ) : item.imageObjectPath ? (
          bgFailed ? (
            <button
              onClick={handleRemoveBg}
              className="flex-1 py-2.5 flex items-center justify-center gap-1.5
                         text-[11px] font-bold uppercase tracking-wider text-red-600
                         active:bg-muted transition-colors"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Failed — retry
            </button>
          ) : (
            <button
              onClick={handleRemoveBg}
              disabled={bgRemoving || !!localImageUrl}
              className="flex-1 py-2.5 flex items-center justify-center gap-1.5
                         text-[11px] font-bold uppercase tracking-wider text-[#6B4A2A]
                         disabled:opacity-40 active:bg-[#F0E8D8] transition-colors"
            >
              <Wand2 className="w-3.5 h-3.5" />
              {bgRemoving ? "Removing…" : localImageUrl ? "Cleaned ✨" : "Clean Up Photo ✨"}
            </button>
          )
        ) : (
          // No photo + not showing lookbook picker → empty right slot
          <div className="flex-1" />
        )}
      </div>

      {/* ── Form ── */}
      <div className="flex-1 px-4 py-5 flex flex-col gap-4">
        <Field
          label="Item Name"
          value={form.name}
          onChange={patch("name") as (v: string) => void}
          placeholder="e.g. Mountain Fleece Jacket"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="Nike, Patagonia…" />
          <Field label="Color" value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Navy Blue" />
        </div>
        <Field label="Size / Volume" value={form.size} onChange={patch("size") as (v: string) => void} placeholder="30ml, 50ml, Full Size…" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Season"   value={form.season}   onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
          <SelectField label="Occasion" value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Price" value={form.purchasePrice} onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
          <Field label="Date"           value={form.purchaseDate}  onChange={patch("purchaseDate")  as (v: string) => void} type="date" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-[#6B4A2A]/70">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => patch("notes")(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            className="w-full border border-[#3A2210]/30 rounded-lg px-3 py-2 text-sm font-medium
                       bg-[#FFFDF8] text-[#2A1206] focus:outline-none focus:ring-2 focus:ring-primary resize-none
                       placeholder:font-normal placeholder:text-[#6B4A2A]/35"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Category"
            value={form.category}
            onChange={patch("category") as (v: string) => void}
            options={CATEGORY_OPTIONS}
          />
          <div className="flex flex-col gap-1 opacity-50 pointer-events-none">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B4A2A]/70">Times Used</span>
            <div className="border border-[#3A2210]/20 rounded-lg px-3 py-2 text-sm font-medium bg-[#FFFDF8]/60 text-[#2A1206]">
              {item.timesWorn ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer actions ── */}
      <div className="sticky bottom-0 px-4 py-4 bg-[#FAF6EE] border-t border-[#3A2210]/20 flex-shrink-0 flex flex-col gap-2">
        <AnimatePresence>
          {dirty && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={handleSave}
              disabled={updateItem.isPending}
              className="w-full btn-brutalist py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              <Save className="w-4 h-4" />
              {updateItem.isPending ? "Saving…" : "Save Changes"}
            </motion.button>
          )}
        </AnimatePresence>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                       font-bold uppercase border border-[#3A2210]/20 text-[#6B4A2A]/50
                       hover:border-red-400 hover:text-red-600 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete from Kit Forever
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border border-[#3A2210]/40 bg-[#FAF6EE] text-[#3A2210]
                         shadow-[2px_2px_0px_0px_rgba(58,34,16,0.20)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-red-600
                         bg-red-500 text-white
                         shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all
                         disabled:opacity-50"
            >
              {deleteItem.isPending ? "Deleting…" : "Yes, Delete Forever"}
            </button>
          </div>
        )}
      </div>
    </motion.div>

    {/* ── BG removal compare overlay ── */}
    <AnimatePresence>
      {showBgSheet && bgPreviewDUrl && (
        <BgRemovalSheet
          originalUrl={localImageUrl ?? item.imageObjectPath ?? ""}
          cleanedUrl={bgPreviewDUrl}
          onSave={handleBgSave}
          onClose={() => setShowBgSheet(false)}
        />
      )}
    </AnimatePresence>

    {/* ── Add to Kit picker ── */}
    <AnimatePresence>
      {showLookbookPicker && (
        <AddToLookbookSheet
          item={item}
          onClose={() => setShowLookbookPicker(false)}
        />
      )}
    </AnimatePresence>
    </>
  );
}
