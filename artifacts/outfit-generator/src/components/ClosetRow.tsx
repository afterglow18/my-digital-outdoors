/**
 * ClosetRow — fixed 3-slot carousel for the wardrobe closet view.
 *
 * Positioned by wardrobe.tsx starting at lm.hangerBot so photos appear directly
 * below the hanger arms (TOPS/BOTTOMS) or at lm.boxY for SHOES (shelf display).
 * The component renders no hanger — background image provides the hanger graphics;
 * a z=20 overlay in wardrobe.tsx re-draws them on top of the clothing cards.
 *
 * • Divides width into 3 equal slots: left | center | right.
 * • Photos are inset ~8% within each slot (photoW = slotW * 0.92, 3:4 portrait).
 *   Inset is applied as horizontal centering (GAP/2 each side) + marginTop (top gap).
 *   Bottom spacing is implicitly provided by row container overflow clipping.
 * • Center item: thin soft-pink border (#F7C6D8, 1.5 px). Left/right: borderless.
 * • Primary selection cue: the pink center hanger baked into the background image.
 * • Swipe gesture translates the strip; release snaps to the nearest item.
 * • Empty slots are transparent — background image shows through.
 *
 * Handle (forwardRef): scrollToIndex(i, smooth?)
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Neutral warm-white shown in the letterbox areas when object-fit:contain
// leaves empty space around the clothing item.
const PHOTO_BG = "#f5f2ee";
import { ClothingItem } from "@workspace/api-client-react";
import { getImageUrl } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ClosetRowHandle {
  scrollToIndex: (index: number, smooth?: boolean) => void;
  getLength: () => number;
}

interface ClosetRowProps {
  items: ClothingItem[];
  onCenteredItem: (item: ClothingItem | null) => void;
  onItemTap?: (item: ClothingItem) => void;
  /** Hard ceiling on photo height in px — set by the parent so all rows
   *  show cards at the same size regardless of available row height. */
  maxPhotoH?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const ClosetRow = forwardRef<ClosetRowHandle, ClosetRowProps>(
  ({ items, onCenteredItem, onItemTap, maxPhotoH }, ref) => {

    // ── Container measurement ─────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const [slotW,      setSlotW]    = useState(0);
    const [containerH, setContH]   = useState(0);

    useLayoutEffect(() => {
      const measure = () => {
        const el = containerRef.current;
        if (!el) return;
        setSlotW(el.clientWidth / 3);
        setContH(el.clientHeight);
      };
      measure();
      const ro = new ResizeObserver(measure);
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    }, []);

    // ── Carousel state ─────────────────────────────────────────────────────────
    const [centredIdx,    setCentredIdx]  = useState(0);
    const [dragX,         setDragX]       = useState(0);
    const [transitioning, setTransition]  = useState(false);

    // Refs so callbacks capture stable references
    const dragStartX   = useRef(0);
    const isDragging   = useRef(false);
    // hasDragged is set true once the pointer has moved far enough during a drag;
    // used to suppress the synthetic click that fires after pointerup.
    const hasDragged   = useRef(false);
    // Track last notified item *identity* so parent is updated on both index AND
    // content changes (e.g. item replaced at the same position).
    const lastNotifiedId = useRef<number | null>(null);

    // Track previous length so we can detect additions vs deletions
    const prevLengthRef = useRef(items.length);

    useEffect(() => {
      const prev = prevLengthRef.current;
      prevLengthRef.current = items.length;

      if (items.length === 0) return;

      if (items.length > prev) {
        // New item uploaded — jump to index 0 (newest item, desc-sorted)
        setCentredIdx(0);
        setDragX(0);
      } else {
        // Deletion: clamp so index stays valid
        setCentredIdx(i => Math.max(0, Math.min(items.length - 1, i)));
      }
    }, [items.length]);

    // Notify parent whenever the centered item's identity changes
    useEffect(() => {
      if (items.length === 0) {
        if (lastNotifiedId.current !== null) {
          lastNotifiedId.current = null;
          onCenteredItem(null);
        }
        return;
      }
      const clamped = Math.max(0, Math.min(items.length - 1, centredIdx));
      const item    = items[clamped];
      if (item && item.id !== lastNotifiedId.current) {
        lastNotifiedId.current = item.id;
        onCenteredItem(item);
      }
    });   // intentionally runs every render — the id-gate is the dedup

    // ── Imperative handle ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      scrollToIndex: (index, smooth = true) => {
        const clamped = Math.max(0, Math.min(items.length - 1, index));
        if (smooth) {
          setTransition(true);
          setCentredIdx(clamped);
          setTimeout(() => setTransition(false), 320);
        } else {
          setTransition(false);
          setCentredIdx(clamped);
        }
      },
      getLength: () => items.length,
    }), [items.length]);

    // ── Pointer events ────────────────────────────────────────────────────────
    const onPointerDown = useCallback((e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartX.current = e.clientX;
      isDragging.current = true;
      hasDragged.current = false;
      setTransition(false);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStartX.current;
      if (!hasDragged.current && Math.abs(dx) > 6) hasDragged.current = true;
      setDragX(dx);
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const dx    = e.clientX - dragStartX.current;
      const moved = hasDragged.current;
      setTransition(true);
      setDragX(0);
      if (moved && slotW > 0) {
        const THRESH = slotW * 0.20;
        if (dx < -THRESH) {
          setCentredIdx(i => Math.min(items.length - 1, i + 1));
        } else if (dx > THRESH) {
          setCentredIdx(i => Math.max(0, i - 1));
        }
      }
      setTimeout(() => setTransition(false), 320);
    }, [slotW, items.length]);

    // ── Item tap (center → open details; side → re-center) ───────────────────
    const onItemActivate = useCallback((item: ClothingItem, idx: number) => {
      // hasDragged is a ref; if the pointer moved significantly, suppress the click
      if (hasDragged.current) return;
      if (idx === centredIdx) {
        onItemTap?.(item);
      } else {
        setTransition(true);
        setCentredIdx(idx);
        setTimeout(() => setTransition(false), 320);
      }
    }, [centredIdx, onItemTap]);

    // ── Geometry ──────────────────────────────────────────────────────────────
    const baseX  = (1 - centredIdx) * slotW;
    const stripX = baseX + dragX;

    // Items beyond ±1.65 slots from center are invisible; all others same size/opacity.
    const isVisible = (i: number) => {
      const itemCX    = i * slotW + slotW / 2 + stripX;
      const containerCX = (slotW * 3) / 2;
      return Math.abs(itemCX - containerCX) / slotW <= 1.65;
    };

    const lo    = Math.max(0, centredIdx - 2);
    const hi    = Math.min(items.length - 1, centredIdx + 2);

    // ── Card geometry ─────────────────────────────────────────────────────────
    // Photos are inset ~8% within each slot so there is breathing room between
    // images and equal whitespace on every side.  The inset is split evenly:
    // half on left/right (horizontal centering) and half as a top margin.
    const GAP    = slotW * 0.06;         // total horizontal gap per slot (~6%)
    const inset  = GAP / 2;             // equal margin each side
    const photoW = slotW - GAP;         // ~94% of slot width
    // Use maxPhotoH (from parent) when provided so all rows show identical card
    // sizes.  Fall back to containerH-based clamp for safety.
    const photoH = Math.min(photoW * 1.5, maxPhotoH ?? (containerH - 2));

    // Center item gets a thin soft-pink outline; left/right items are borderless.
    const CENTER_BORDER = "1.5px solid #F7C6D8";

    // Don't render until we've measured the container
    if (!slotW || !containerH) {
      return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
    }

    return (
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          touchAction: "pan-y",
          userSelect: "none",
          cursor: items.length > 1 ? "ew-resize" : "default",
        }}
      >
        {/* Strip — all (visible-range) items side by side */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: items.length * slotW,
            height: "100%",
            transform: `translateX(${stripX}px)`,
            transition: transitioning
              ? "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)"
              : "none",
            willChange: "transform",
          }}
        >
          {items.slice(lo, hi + 1).map((item, localIdx) => {
            const i        = lo + localIdx;
            if (!isVisible(i)) return null;
            const isCenter = i === centredIdx;

            return (
              <button
                key={item.id}
                onClick={() => onItemActivate(item, i)}
                aria-label={isCenter
                  ? `${item.name ?? "Item"} — selected. Tap to view details.`
                  : `${item.name ?? "Item"} — tap to select`}
                aria-pressed={isCenter}
                style={{
                  position: "absolute",
                  top: 0,
                  left: i * slotW,
                  width: slotW,
                  height: "100%",
                  cursor: isCenter ? "pointer" : "ew-resize",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  WebkitTapHighlightColor: "transparent",
                  // Center the inset card horizontally inside the full-width button
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {/* Photo card — inset ~8% within its slot for breathing room.
                    Center item: thin soft-pink outline (#F7C6D8).
                    Left/right items: borderless.
                    Pink hanger in background image is the primary selection cue.
                    Hanger overlay at z=20 (wardrobe.tsx) renders on top. */}
                <div
                  style={{
                    width: photoW,
                    height: photoH,
                    overflow: "hidden",
                    borderRadius: "10px",
                    background: PHOTO_BG,
                    border: isCenter ? CENTER_BORDER : "none",
                    boxShadow: "none",
                    position: "relative",
                    pointerEvents: "none",
                    padding: 0,
                    flexShrink: 0,
                    marginTop: 2,      // minimal top gap — maximise visible photo height
                  }}
                >
                  {item.imageObjectPath ? (
                    <img
                      src={getImageUrl(item.imageObjectPath)!}
                      alt={item.name ?? ""}
                      draggable={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        objectPosition: "center",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.3rem",
                        opacity: 0.5,
                      }}
                    >
                      {item.name?.slice(0, 2) ?? "👗"}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

ClosetRow.displayName = "ClosetRow";
