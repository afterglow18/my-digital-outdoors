---
name: Search & vision indexer
description: Photo-search architecture — visionVersion scheme, indexer lifecycle, search scoring, AddToLookbook flow.
---

## visionVersion scheme
Each `StoredClothingItem` carries a `visionVersion` number:

| Value | Meaning                          |
|-------|----------------------------------|
| 0     | Unanalyzed (default)             |
| 1     | iOS VisionKit (native)           |
| 4     | Web canvas — labels found        |
| 5     | Web canvas — tried, no labels    |

`listItemsNeedingVisionIndex(isNative)`:
- Native: `visionVersion === 0` only
- Web: `visionVersion < 4` (re-analyzes native-analyzed items with web canvas if labels missing)

**Why:** iOS `VNClassifyImageRequest` gives richer object labels; the web canvas fallback only extracts color names. Keeping separate version numbers lets each platform re-analyze items the other missed without re-processing finished ones.

## Indexer lifecycle
- `startVisionIndexer()` — call once from `AppShell` `useEffect`. Guards against double-start with a `started` boolean.
- `queueItemForIndex(id, imageObjectPath)` — call after adding/updating a photo to trigger immediate background analysis.
- Shows a sonner `loading` toast while a batch is in progress; dismisses on completion.
- 350 ms delay between items to keep the UI thread free.
- On failure for a single item: logs warning, continues. Never throws to caller.

## Search scoring
`searchItems(allItems, query)` / `searchOutfits(outfits, query)` — see `src/lib/search.ts`.
- Searches name, brand, color, category, notes, size, season, occasion, price, date.
- Also searches `visionLabels` and `visionText` for photo-derived keywords.
- Returns scored + sorted results; consumer decides threshold.

## AddToLookbookSheet
- Accessible from `ItemDetailsSheet` when `showAddToLookbook={true}`.
- Optimistic local state for checkmarks; resolves against the real outfit data after mutation.
- Uses `useAddItemToOutfit` / `useRemoveItemFromOutfit` hooks.
- Pass `showAddToLookbook={true}` from search results / Kit Log; `false` (default) from main wardrobe.

## Wearing Today
- `ItemDetailsSheet` action bar always shows 2 buttons: "Wearing Today" + context button.
- "Wearing Today" increments `timesWorn`, shows sonner toast "Worn today! 🥾", sets `wornToday` local state for the session.
- Button becomes "Worn Today ✓" and disables after tap.

## Codemagic VisionAnalyzer injection
Step name: "Inject VisionAnalyzer native plugin" — runs after "Capacitor add iOS and sync".
Copies `ios-plugins/VisionAnalyzer/VisionPlugin.swift` and `.m` into `ios/App/App/`,
then uses `xcodeproj` Ruby gem to register them in the Xcode target.
