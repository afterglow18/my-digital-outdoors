import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  useListOutfits,
  useListClothing,
  useDeleteOutfit,
  useRenameOutfit,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListOutfitsQueryKey,
  type ClothingItem,
} from "@/hooks/useLocalDB";
import { Trash2, Bookmark, Plus, Pencil, Check, X, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeSheet } from "@/components/paywall/UpgradeSheet";
import { FREE_OUTFIT_LIMIT } from "@/lib/entitlements";
import { WardrobePickerSheet } from "@/components/clothing/WardrobePickerSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { searchItems, searchOutfits } from "@/lib/search";

const SLOT_ORDER = ["outfits", "beauty", "toiletries", "essentials"] as const;
type SlotKey = (typeof SLOT_ORDER)[number];

const SLOT_LABELS: Record<SlotKey, string> = {
  outfits:    "Gear",
  beauty:     "Equipment",
  toiletries: "Supplies",
  essentials: "Accessories",
};

function ItemPhoto({
  item, size = "md", onClick,
}: { item: ClothingItem; size?: "sm" | "md" | "lg"; onClick?: () => void }) {
  const sizeClass = size === "lg" ? "h-28" : size === "md" ? "h-20" : "h-14";
  return (
    <button
      onClick={onClick}
      className={`w-full ${sizeClass} border-2 border-black overflow-hidden relative`}
      style={{ background: "#F5EDD8", padding: 0, display: "block" }}
    >
      {item.imageObjectPath ? (
        <img
          src={getImageUrl(item.imageObjectPath)!}
          alt={item.name}
          className="w-full h-full object-contain"
          style={{ objectFit: "contain", objectPosition: "center" }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-1">
          <span className="text-[9px] font-bold uppercase text-center leading-tight text-black/30">—</span>
        </div>
      )}
      {item.isFavorite && (
        <span className="absolute top-1 right-1 text-[10px] leading-none">❤️</span>
      )}
    </button>
  );
}

export default function SavedPage() {
  const { data: outfits, isLoading } = useListOutfits();
  const { data: allItems = [] }       = useListClothing();
  const deleteOutfit         = useDeleteOutfit();
  const renameOutfit         = useRenameOutfit();
  const removeItemFromOutfit = useRemoveItemFromOutfit();
  const addItemToOutfit      = useAddItemToOutfit();
  const queryClient          = useQueryClient();
  const { tier }             = useEntitlements();

  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [replacingSlot,  setReplacingSlot]  = useState<{ outfitId: number; category: SlotKey } | null>(null);
  const [addingExtra,    setAddingExtra]    = useState<number | null>(null);
  const [detailsItem,    setDetailsItem]    = useState<ClothingItem | null>(null);
  const [detailsFromSearch, setDetailsFromSearch] = useState(false);
  const [renamingId,     setRenamingId]     = useState<number | null>(null);
  const [renameValue,    setRenameValue]    = useState("");
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [notesValue,     setNotesValue]     = useState("");
  const [highlightedId,  setHighlightedId]  = useState<number | null>(null);

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstChar      = useRef(false);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.focus();
  }, [renamingId]);

  useEffect(() => {
    if (editingNotesId !== null) notesInputRef.current?.focus();
  }, [editingNotesId]);

  // Scroll to top on first keystroke
  function handleSearchChange(value: string) {
    if (!firstChar.current && value.length > 0) {
      firstChar.current = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (value.length === 0) firstChar.current = false;
    setSearchQuery(value);
  }

  const itemResults   = useMemo(() => searchItems(allItems, searchQuery),  [allItems, searchQuery]);
  const outfitResults = useMemo(() => searchOutfits(outfits ?? [], searchQuery), [outfits, searchQuery]);
  const isSearching   = searchQuery.trim().length > 0;

  function openOutfit(outfitId: number) {
    setSearchQuery("");
    firstChar.current = false;
    setHighlightedId(outfitId);
    setTimeout(() => {
      document
        .querySelector(`[data-testid="outfit-card-${outfitId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => setHighlightedId(null), 2000);
    }, 80);
  }

  // ── Outfit CRUD ────────────────────────────────────────────────────────────

  const startRename = (id: number, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = (id: number) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== outfits?.find((o) => o.id === id)?.name) {
      renameOutfit.mutate(
        { id, data: { name: trimmed } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
      );
    }
    setRenamingId(null);
  };

  const startEditNotes = (id: number, currentNotes: string | null | undefined) => {
    setEditingNotesId(id);
    setNotesValue(currentNotes ?? "");
  };

  const commitNotes = (id: number) => {
    const trimmed = notesValue.trim();
    const current = outfits?.find((o) => o.id === id)?.notes ?? "";
    if (trimmed !== (current ?? "")) {
      renameOutfit.mutate(
        { id, data: { notes: trimmed || null } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
      );
    }
    setEditingNotesId(null);
  };

  const isFree     = tier === "free";
  const outfitCount = outfits?.length ?? 0;
  const atLimit    = isFree && outfitCount >= FREE_OUTFIT_LIMIT;

  const handleDelete = (id: number) => {
    deleteOutfit.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
    );
  };

  const handleRemoveItem = (outfitId: number, itemId: number) => {
    removeItemFromOutfit.mutate(
      { id: outfitId, itemId },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
    );
  };

  const handlePickedItem = (item: ClothingItem) => {
    if (replacingSlot == null) return;
    addItemToOutfit.mutate(
      { id: replacingSlot.outfitId, data: { itemId: item.id } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
    );
    setReplacingSlot(null);
  };

  const handlePickedExtra = (item: ClothingItem) => {
    if (addingExtra == null) return;
    addItemToOutfit.mutate(
      { id: addingExtra, data: { itemId: item.id } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
    );
    setAddingExtra(null);
  };

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 md:px-8 bg-secondary/10 relative">
      <div className="w-full max-w-3xl mx-auto">

      {/* ── Header ── */}
      <header className="mb-4">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">Kit Log</h1>
        <div className="flex items-center justify-between">
          <p className="font-medium text-muted-foreground text-sm">Hall of fame.</p>
          {isFree && outfitCount > 0 && (
            <button
              onClick={() => setShowUpgrade(true)}
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full
                          border-2 transition-colors
                          ${atLimit
                            ? "bg-black text-white border-black"
                            : outfitCount >= FREE_OUTFIT_LIMIT - 1
                            ? "bg-primary border-black text-black"
                            : "bg-white border-black/20 text-black/40 hover:border-black/40"
                          }`}
            >
              {outfitCount}/{FREE_OUTFIT_LIMIT} saved
            </button>
          )}
        </div>
      </header>

      {/* ── Search bar ── */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40 pointer-events-none" />
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border-2 border-black bg-white
                     font-medium text-sm placeholder:text-black/30
                     outline-none focus:ring-2 focus:ring-primary
                     shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(""); firstChar.current = false; }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center
                       rounded-full bg-black/10 hover:bg-black/20 transition-colors"
          >
            <X className="w-3 h-3 text-black/50" />
          </button>
        )}
      </div>

      {/* ── Limit banner ── */}
      {atLimit && !isLoading && !isSearching && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 border-2 border-black rounded-xl bg-primary p-4
                     shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <p className="font-display font-bold text-sm uppercase tracking-tight">🔓 Kit Rack is full</p>
          <p className="text-xs text-black/60 mt-1 mb-3 leading-snug">
            You've saved {FREE_OUTFIT_LIMIT} kits — the free limit. Unlock Forever to save unlimited kits.
          </p>
          <button
            onClick={() => setShowUpgrade(true)}
            className="w-full py-2.5 rounded-lg border-2 border-black bg-black text-white
                       font-bold uppercase text-xs tracking-wide
                       shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            Unlock Forever – $4.99
          </button>
        </motion.div>
      )}

      {/* ── Search results ── */}
      {isSearching ? (
        <div className="flex flex-col gap-5">
          {/* Items */}
          {itemResults.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-black/35 mb-2">
                Items
              </p>
              <div className="flex flex-col gap-2">
                {itemResults.map(({ item }) => (
                  <button
                    key={item.id}
                    onClick={() => { setDetailsItem(item); setDetailsFromSearch(true); }}
                    className="flex items-center gap-3 p-3 bg-white border-2 border-black rounded-xl
                               shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-left
                               active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                  >
                    <div
                      className="w-12 h-12 border-2 border-black/20 rounded overflow-hidden flex-shrink-0"
                      style={{ background: "#F5EDD8" }}
                    >
                      {item.imageObjectPath && (
                        <img
                          src={getImageUrl(item.imageObjectPath)!}
                          alt={item.name}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-sm uppercase tracking-tight truncate">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">
                        {SLOT_LABELS[item.category as SlotKey] ?? item.category}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Kits / groups */}
          {outfitResults.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-black/35 mb-2">
                Kits
              </p>
              <div className="flex flex-col gap-2">
                {outfitResults.map(({ outfit }) => (
                  <button
                    key={outfit.id}
                    onClick={() => openOutfit(outfit.id)}
                    className="flex items-center gap-3 p-3 bg-white border-2 border-black rounded-xl
                               shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-left
                               active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                  >
                    {/* 3-thumbnail row */}
                    <div className="flex gap-1">
                      {Array.from({ length: 3 }).map((_, i) => {
                        const img = outfit.items[i]?.imageObjectPath;
                        return (
                          <div
                            key={i}
                            className="w-10 h-10 border border-black/20 rounded overflow-hidden flex-shrink-0"
                            style={{ background: "#F5EDD8" }}
                          >
                            {img && (
                              <img
                                src={getImageUrl(img)!}
                                alt=""
                                className="w-full h-full object-contain"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-sm uppercase tracking-tight truncate">
                        {outfit.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {outfit.items.length} item{outfit.items.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {itemResults.length === 0 && outfitResults.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">
              No results for "{searchQuery}"
            </p>
          )}
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 bg-muted animate-pulse border-2 border-black rounded-xl" />
          ))}
        </div>
      ) : outfits && outfits.length > 0 ? (
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start">
          {outfits.map((outfit) => {
            const bySlot = (outfit.items ?? []).reduce<Partial<Record<SlotKey, ClothingItem>>>(
              (acc, item) => {
                const key = item.category as SlotKey;
                if (SLOT_ORDER.includes(key) && !acc[key]) acc[key] = item;
                return acc;
              },
              {}
            );
            const knownIds = new Set(Object.values(bySlot).map((i) => i?.id));
            const extras   = (outfit.items ?? []).filter((i) => !knownIds.has(i.id));
            const isHighlighted = highlightedId === outfit.id;

            return (
              <motion.div
                key={outfit.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden transition-all"
                style={{
                  background: isHighlighted ? "hsl(24 100% 95%)" : "white",
                  boxShadow: isHighlighted
                    ? "4px 4px 0px 0px rgba(197,68,0,1)"
                    : "4px 4px 0px 0px rgba(0,0,0,1)",
                }}
                data-testid={`outfit-card-${outfit.id}`}
              >
                {/* Card header */}
                <div className="px-4 py-3 border-b-2 border-black flex justify-between items-center bg-primary gap-2">
                  {renamingId === outfit.id ? (
                    <form
                      className="flex-1 flex items-center gap-1"
                      onSubmit={(e) => { e.preventDefault(); commitRename(outfit.id); }}
                    >
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(outfit.id)}
                        maxLength={60}
                        className="flex-1 font-display font-bold text-lg uppercase tracking-tight bg-white/60 border-2 border-black rounded-lg px-2 py-0.5 outline-none min-w-0"
                      />
                      <button type="submit" className="w-7 h-7 flex items-center justify-center bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => startRename(outfit.id, outfit.name)}
                      className="flex-1 flex items-center gap-1.5 text-left group min-w-0"
                    >
                      <h3 className="font-display font-bold text-lg uppercase tracking-tight truncate">{outfit.name}</h3>
                      <Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(outfit.id)}
                    className="w-8 h-8 flex items-center justify-center bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none hover:bg-destructive/10 transition-colors shrink-0"
                    data-testid={`button-delete-outfit-${outfit.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Notes */}
                <div className="px-4 py-2 border-b border-black/10">
                  {editingNotesId === outfit.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); commitNotes(outfit.id); }} className="flex gap-2">
                      <textarea
                        ref={notesInputRef}
                        value={notesValue}
                        onChange={(e) => setNotesValue(e.target.value)}
                        onBlur={() => commitNotes(outfit.id)}
                        rows={2}
                        maxLength={300}
                        placeholder="Add notes…"
                        className="flex-1 text-xs border-2 border-black rounded-lg px-2 py-1.5 resize-none outline-none focus:ring-2 focus:ring-primary bg-white"
                      />
                      <button type="submit" className="self-start w-7 h-7 flex items-center justify-center bg-black text-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button onClick={() => startEditNotes(outfit.id, outfit.notes)} className="w-full text-left group">
                      {outfit.notes ? (
                        <p className="text-xs text-black/60 leading-snug flex items-start gap-1">
                          <span className="flex-1">{outfit.notes}</span>
                          <Pencil className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                        </p>
                      ) : (
                        <p className="text-xs text-black/25 italic">Add notes…</p>
                      )}
                    </button>
                  )}
                </div>

                {/* 4-slot grid */}
                <div className="p-3">
                  <div className="grid grid-cols-4 gap-2">
                    {SLOT_ORDER.map((slot) => {
                      const item = bySlot[slot];
                      return (
                        <div key={slot} className="flex flex-col gap-0.5">
                          {item ? (
                            <>
                              <ItemPhoto item={item} size="lg" onClick={() => { setDetailsItem(item); setDetailsFromSearch(false); }} />
                              <div className="flex items-center justify-between px-0.5">
                                <span className="text-[8px] font-bold uppercase text-muted-foreground truncate">
                                  {SLOT_LABELS[slot]}
                                </span>
                                <button
                                  onClick={() => handleRemoveItem(outfit.id, item.id)}
                                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-black/10 hover:bg-red-100 transition-colors flex-shrink-0"
                                >
                                  <X className="w-2.5 h-2.5 text-black/50" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setReplacingSlot({ outfitId: outfit.id, category: slot })}
                                className="h-28 w-full border-2 border-dashed border-black/25 rounded flex flex-col items-center justify-center gap-1 hover:border-black/50 hover:bg-black/5 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5 text-black/30" />
                              </button>
                              <span className="text-[8px] font-bold uppercase text-black/25 text-center truncate">
                                {SLOT_LABELS[slot]}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Extras */}
                  <div className="mt-3 pt-3 border-t border-black/10">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-black/30 mb-2">Extras</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {Array.from({ length: 10 }).map((_, i) => {
                        const item = extras[i];
                        return item ? (
                          <div key={item.id} className="relative flex flex-col gap-0.5">
                            <button
                              onClick={() => { setDetailsItem(item); setDetailsFromSearch(false); }}
                              className="w-full aspect-square border-2 border-black overflow-hidden rounded"
                              style={{ background: "#F5EDD8" }}
                            >
                              {item.imageObjectPath ? (
                                <img src={getImageUrl(item.imageObjectPath)!} alt={item.name} className="w-full h-full object-contain" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-[8px] font-bold text-black/30">—</span>
                                </div>
                              )}
                            </button>
                            {item.isFavorite && (
                              <span className="absolute top-0 left-0 text-[10px] leading-none z-20 pointer-events-none">⭐</span>
                            )}
                            <button
                              onClick={() => handleRemoveItem(outfit.id, item.id)}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-white border border-black rounded-full flex items-center justify-center shadow-sm z-10"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </div>
                        ) : (
                          <button
                            key={`empty-${i}`}
                            onClick={() => setAddingExtra(outfit.id)}
                            className="aspect-square border-2 border-dashed border-black/25 rounded flex items-center justify-center hover:border-black/50 hover:bg-black/5 transition-colors"
                          >
                            <Plus className="w-3 h-3 text-black/25" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-3 pb-3">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
                    {outfit.items?.length ?? 0} item{(outfit.items?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl mt-8">
          <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center border-2 border-black mb-4">
            <Bookmark className="w-7 h-7" />
          </div>
          <h3 className="font-display font-bold text-xl mb-2">No kits saved yet.</h3>
          <p className="text-sm font-medium text-muted-foreground">
            Head to your Outdoors tab, spin the slots, and save kits you love.
          </p>
        </div>
      )}

      {/* ── Sheets ── */}
      <AnimatePresence>
        {showUpgrade && <UpgradeSheet reason="outfits" onClose={() => setShowUpgrade(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {replacingSlot !== null && (
          <WardrobePickerSheet
            key={`${replacingSlot.outfitId}-${replacingSlot.category}`}
            open
            onOpenChange={(open) => { if (!open) setReplacingSlot(null); }}
            category={replacingSlot.category}
            existingItemIds={
              outfits?.find((o) => o.id === replacingSlot.outfitId)?.items?.map((i) => i.id) ?? []
            }
            onPick={handlePickedItem}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addingExtra !== null && (
          <WardrobePickerSheet
            key={`extra-${addingExtra}`}
            open
            onOpenChange={(open) => { if (!open) setAddingExtra(null); }}
            existingItemIds={
              outfits?.find((o) => o.id === addingExtra)?.items?.map((i) => i.id) ?? []
            }
            onPick={handlePickedExtra}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={() => { setDetailsItem(null); setDetailsFromSearch(false); }}
            showAddToLookbook={detailsFromSearch}
          />
        )}
      </AnimatePresence>

      </div>{/* /max-w-3xl wrapper */}
    </div>
  );
}
