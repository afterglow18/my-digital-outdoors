---
name: Search & vision indexer
description: Photo-search architecture — visionVersion scheme, indexer lifecycle, search scoring, AddToLookbook flow.
---

## visionVersion scheme
Each `StoredClothingItem` carries a `visionVersion` number:

| Value | Meaning                          |
|-------|----------------------------------|
| 0     | Unanalyzed (default)                               |
| 1     | Old iOS-only pass — no color labels (stale)        |
| 2     | iOS native + canvas merged (current native target) |
| 4     | Web canvas — labels found                          |
| 5     | Web canvas — tried, no labels                      |

`listItemsNeedingVisionIndex(isNative)`:
- Native: `v < 2` — catches v0 (never indexed) and v1 (old iOS pass missing color labels)
- Web:    `v < 4` — unchanged

**Why:** Apple `VNClassifyImageRequest` returns object types ("shoe", "high heel") but never color names. Canvas extraction runs in parallel on native too (via `Promise.all`) and the label arrays are merged before saving. v1 items from a previous build only have object labels; bumping the threshold to `< 2` triggers a one-time re-index on next app open so those items get color labels added.

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

## Codemagic VisionAnalyzer injection
Step name: "Inject VisionAnalyzer native plugin" — runs after "Capacitor add iOS and sync".
Copies `ios-plugins/VisionAnalyzer/VisionPlugin.swift` and `.m` into `ios/App/App/`,
then uses `xcodeproj` Ruby gem to register them in the Xcode target.
