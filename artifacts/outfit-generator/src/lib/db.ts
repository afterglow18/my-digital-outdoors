/**
 * Local IndexedDB database for My Digital Garage.
 *
 * Schema v1:
 *   clothing_items  — wardrobe items with embedded image data URLs
 *   saved_outfits   — named outfit collections
 *   outfit_items    — junction: outfit ↔ clothing item
 *   settings        — key/value store for app preferences
 *
 * Schema v2 (non-destructive):
 *   clothing_items gains optional vision fields:
 *     visionLabels   — color/object labels from iOS Vision or web canvas
 *     visionText     — text detected inside the photo
 *     visionVersion  — 0=unanalyzed, 1=iOS Vision, 4=web canvas, 5=web/no-labels
 *   Existing records are left untouched; undefined fields are treated as v0.
 */

import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME    = "my-digital-garage";
export const DB_VERSION = 2;

// ── Stored types (IndexedDB records) ─────────────────────────────────────────

export interface StoredClothingItem {
  id?:            number;        // auto-incremented
  name:           string;
  category:       string;        // "outfits" | "beauty" | "toiletries" | "essentials"
  imageObjectPath: string | null; // JPEG data URL  (e.g. "data:image/jpeg;base64,...")
  isFavorite:     boolean;
  timesWorn:      number;
  color?:         string | null;
  brand?:         string | null;
  size?:          string | null;
  season?:        string | null;
  occasion?:      string | null;
  purchasePrice?: string | null;
  purchaseDate?:  string | null;
  notes?:         string | null;
  createdAt:      string;
  updatedAt:      string;
  // ── v2 vision fields (optional — undefined on old records = version 0) ──
  visionLabels?:  string[];      // color/object labels
  visionText?:    string[];      // text extracted from photo
  visionVersion?: number;        // 0=unanalyzed,1=iOS Vision,4=web canvas,5=web/no-labels
}

export interface StoredOutfit {
  id?:       number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
}

export interface StoredOutfitItem {
  id?:             number;
  outfitId:        number;
  clothingItemId:  number;
}

export interface StoredSetting {
  key:   string;
  value: string;
}

// ── Public types (consumed by hooks and pages) ────────────────────────────────

export interface ClothingItem extends Required<StoredClothingItem> {
  id: number;
  // vision fields are always present on the public type; default to [] / 0
  visionLabels:  string[];
  visionText:    string[];
  visionVersion: number;
}

export interface SavedOutfit {
  id:        number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
  items:     ClothingItem[];
}

// ── Singleton DB connection ───────────────────────────────────────────────────

let _db: IDBPDatabase | null = null;

export async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── v1 stores (created fresh on first install) ──
      if (oldVersion < 1) {
        const items = db.createObjectStore("clothing_items", {
          keyPath:       "id",
          autoIncrement: true,
        });
        items.createIndex("by_category", "category");
        items.createIndex("by_favorite", "isFavorite");

        db.createObjectStore("saved_outfits", {
          keyPath:       "id",
          autoIncrement: true,
        });

        const outfitItems = db.createObjectStore("outfit_items", {
          keyPath:       "id",
          autoIncrement: true,
        });
        outfitItems.createIndex("by_outfit", "outfitId");
        outfitItems.createIndex("by_item",   "clothingItemId");

        db.createObjectStore("settings", { keyPath: "key" });
      }

      // ── v2: no structural changes — vision fields are just optional
      //    properties on existing clothing_items records.  Old records
      //    will have undefined for these keys; the app treats undefined
      //    as visionVersion=0 (unanalyzed).
      // if (oldVersion < 2) { /* nothing to migrate */ }
    },

    blocked() {
      console.warn("[DB] Upgrade blocked — close other tabs");
    },

    blocking() {
      _db?.close();
      _db = null;
    },
  });

  return _db;
}
