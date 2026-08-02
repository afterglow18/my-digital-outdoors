/**
 * search — score-based full-text search across wardrobe items and saved kits.
 *
 * Field weights (higher = ranked first):
 *   name, brand          10, 8
 *   category, color      6,  5
 *   notes                4
 *   season, occasion     3,  3
 *   size, price, date    2,  2, 2
 *   visionLabels, text   1,  1
 *
 * Matching: case-insensitive substring.
 * An outfit matches if its name, notes, or any contained item matches.
 */

import type { ClothingItem, SavedOutfit } from "@/lib/db";

type FieldDef = { value: string | null | undefined; weight: number };

function includes(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

export function scoreItem(item: ClothingItem, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  const fields: FieldDef[] = [
    { value: item.name,          weight: 10 },
    { value: item.brand,         weight:  8 },
    { value: item.category,      weight:  6 },
    { value: item.color,         weight:  5 },
    { value: item.notes,         weight:  4 },
    { value: item.season,        weight:  3 },
    { value: item.occasion,      weight:  3 },
    { value: item.size,          weight:  2 },
    { value: item.purchasePrice, weight:  2 },
    { value: item.purchaseDate,  weight:  2 },
    { value: (item.visionLabels ?? []).join(" "), weight: 1 },
    { value: (item.visionText   ?? []).join(" "), weight: 1 },
  ];

  return fields.reduce((score, { value, weight }) =>
    includes(value, q) ? score + weight : score, 0);
}

export function scoreOutfit(outfit: SavedOutfit, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  // Match on outfit name / notes
  let score = 0;
  if (includes(outfit.name,  q)) score += 10;
  if (includes(outfit.notes, q)) score +=  4;

  // Match on any item inside the outfit
  const itemMax = Math.max(0, ...(outfit.items ?? []).map((i) => scoreItem(i, q)));
  score += itemMax;

  return score;
}

export interface ItemSearchResult {
  item:  ClothingItem;
  score: number;
}

export interface OutfitSearchResult {
  outfit: SavedOutfit;
  score:  number;
}

export function searchItems(items: ClothingItem[], query: string): ItemSearchResult[] {
  if (!query.trim()) return [];
  return items
    .map((item) => ({ item, score: scoreItem(item, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function searchOutfits(outfits: SavedOutfit[], query: string): OutfitSearchResult[] {
  if (!query.trim()) return [];
  return outfits
    .map((outfit) => ({ outfit, score: scoreOutfit(outfit, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
