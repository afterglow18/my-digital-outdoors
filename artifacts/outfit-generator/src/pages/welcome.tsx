/**
 * WelcomePage — 3-phase splash sequence (once per cold launch)
 *
 * Phase 1  HERO    : Full-screen hero image + gradient + branding. Auto-advances at 2.5 s.
 * Phase 2  IDLE    : Cabin-door animation revealed. Branding + "Enter" button at bottom.
 * Phase 3  OPENING : Door swings open (0.75 s) → fade out → onEnter().
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props { onEnter: () => void; }

// ── Cabin door face ────────────────────────────────────────────────────────────
function DoorFace() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>

      {/* Base wood colour */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(175deg, #6B3C1A 0%, #3D1E08 35%, #523018 65%, #2A1006 100%)",
      }} />

      {/* Horizontal plank seams */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `repeating-linear-gradient(
          to bottom,
          transparent 0px, transparent 58px,
          rgba(0,0,0,0.22) 58px, rgba(0,0,0,0.22) 61px
        )`,
        pointerEvents: "none",
      }} />

      {/* Subtle vertical wood grain */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `repeating-linear-gradient(
          93deg,
          transparent 0px, transparent 26px,
          rgba(0,0,0,0.04) 26px, rgba(0,0,0,0.04) 28px,
          transparent 28px, transparent 54px,
          rgba(255,255,255,0.015) 54px, rgba(255,255,255,0.015) 56px
        )`,
        pointerEvents: "none",
      }} />

      {/* Door frame inset border */}
      <div style={{
        position: "absolute",
        top: 14, left: 14, right: 14, bottom: 14,
        border: "5px solid rgba(0,0,0,0.32)",
        borderRadius: 3,
        boxShadow: "inset 0 0 28px rgba(0,0,0,0.38), 0 0 18px rgba(0,0,0,0.25)",
        pointerEvents: "none",
      }} />

      {/* App title on door */}
      <div style={{
        position: "absolute",
        top: "23%",
        left: 0, right: 0,
        textAlign: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          fontFamily: "var(--font-display, serif)",
          fontWeight: 900,
          fontSize: "clamp(28px, 8vw, 46px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.08,
          color: "#EDD9B0",
          textShadow: "0 2px 14px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.9)",
        }}>
          MY DIGITAL<br />OUTDOORS
        </div>
        <div style={{
          marginTop: 9,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.24em",
          textTransform: "uppercase" as const,
          color: "rgba(232,210,168,0.38)",
        }}>
          your outdoor kit
        </div>
      </div>

      {/* Upper panel */}
      <div style={{
        position: "absolute",
        top: "42%", left: "10%", right: "10%",
        height: "15%",
        border: "3px solid rgba(0,0,0,0.28)",
        borderRadius: 2,
        background: "rgba(0,0,0,0.10)",
        boxShadow: "inset 0 2px 8px rgba(0,0,0,0.28), inset 0 -1px 2px rgba(255,255,255,0.035)",
      }} />

      {/* Lower panel */}
      <div style={{
        position: "absolute",
        top: "60%", left: "10%", right: "10%",
        height: "24%",
        border: "3px solid rgba(0,0,0,0.28)",
        borderRadius: 2,
        background: "rgba(0,0,0,0.08)",
        boxShadow: "inset 0 2px 8px rgba(0,0,0,0.28), inset 0 -1px 2px rgba(255,255,255,0.035)",
      }} />

      {/* Strap hinges (left edge) */}
      {([18, 75] as const).map((topPct) => (
        <div key={topPct} style={{
          position: "absolute",
          left: 0,
          top: `${topPct}%`,
          width: "15%", height: 20,
          background: "linear-gradient(to bottom, #2E2E2E, #161616)",
          borderRadius: "0 5px 5px 0",
          boxShadow: "0 2px 5px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)",
          transform: "translateY(-50%)",
        }}>
          {[25, 65].map((lp) => (
            <div key={lp} style={{
              position: "absolute",
              left: `${lp}%`, top: "50%",
              transform: "translate(-50%,-50%)",
              width: 5, height: 5, borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, #888, #333)",
              border: "1px solid #111",
            }} />
          ))}
        </div>
      ))}

      {/* Door knob */}
      <div style={{
        position: "absolute",
        right: "9%",
        top: "56%",
        transform: "translateY(-50%)",
      }}>
        <div style={{
          width: 14, height: 34,
          background: "linear-gradient(to right, #8A6020, #C8900C, #8A6020)",
          borderRadius: 4,
          marginBottom: -2,
          position: "relative", left: 7,
          boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }} />
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #F0D060, #9A7020)",
          border: "2px solid #5A3A08",
          boxShadow: "0 3px 10px rgba(0,0,0,0.65), inset 0 1px 3px rgba(255,255,255,0.32)",
        }} />
      </div>

      {/* Right-edge shadow */}
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: 10,
        background: "linear-gradient(to left, rgba(0,0,0,0.45), transparent)",
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<"hero" | "idle" | "opening" | "exiting">("hero");
  const calledRef = useRef(false);

  // Phase 1 → Phase 2 auto-advance after 2.5 s
  useEffect(() => {
    if (phase !== "hero") return;
    const t = setTimeout(() => setPhase("idle"), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  const handleEnter = useCallback(() => {
    if (phase !== "idle") return;
    setPhase("opening");
    // Start exit fade after door has swung open
    setTimeout(() => setPhase("exiting"), 750);
    // Call onEnter after fade completes
    setTimeout(() => {
      if (calledRef.current) return;
      calledRef.current = true;
      onEnter();
    }, 1200);
  }, [phase, onEnter]);

  const doorOpen = phase === "opening" || phase === "exiting";

  return (
    <motion.div
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.5, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        overflow: "hidden",
        background: "#060302",
      }}
    >
      {/* ── Hero image — always behind everything ── */}
      <img
        src="/hero-bg.png"
        alt=""
        draggable={false}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center top",
          pointerEvents: "none", userSelect: "none",
        }}
      />

      {/* ════════════════════════════════════════════════════════
          PHASE 2 + 3 — Door scene (rendered behind hero overlay)
          ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {phase !== "hero" && (
          <motion.div
            key="door-scene"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0 }}
          >
            {/* Dark exterior — fades as door opens */}
            <motion.div
              style={{ position: "absolute", inset: 0, background: "#040100", pointerEvents: "none" }}
              animate={{ opacity: doorOpen ? 0 : 0.92 }}
              transition={{ duration: 0.85, delay: 0.25 }}
            />

            {/* 3-D door swing */}
            <div style={{
              position: "absolute", inset: 0,
              perspective: "1100px",
              perspectiveOrigin: "22% 50%",
            }}>
              <motion.div
                style={{
                  position: "absolute", inset: 0,
                  transformOrigin: "left center",
                }}
                initial={false}
                animate={{ rotateY: doorOpen ? -110 : 0 }}
                transition={{ duration: 0.75, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <DoorFace />
              </motion.div>
            </div>

            {/* Bottom branding + Enter button */}
            <motion.div
              animate={{ opacity: doorOpen ? 0 : 1 }}
              transition={{ duration: 0.2 }}
              style={{
                position: "absolute",
                bottom: "calc(env(safe-area-inset-bottom) + 76px)",
                left: 0, right: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: 14,
                pointerEvents: doorOpen ? "none" : "auto",
              }}
            >
              {/* Branding */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 11, fontWeight: 500,
                  letterSpacing: "0.24em",
                  textTransform: "uppercase" as const,
                  color: "rgba(237,217,176,0.55)",
                  marginBottom: 5,
                }}>
                  Welcome to
                </div>
                <div style={{
                  fontFamily: "var(--font-display, serif)",
                  fontWeight: 900,
                  fontSize: "clamp(24px, 7.5vw, 38px)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                  color: "#EDD9B0",
                  textShadow: "0 2px 16px rgba(0,0,0,0.8)",
                }}>
                  MY DIGITAL<br />OUTDOORS
                </div>
              </div>

              {/* Enter button */}
              <button
                onClick={handleEnter}
                style={{
                  padding: "14px 44px",
                  background: "#E05C00",
                  border: "none",
                  borderRadius: 40,
                  fontFamily: "var(--font-display, serif)",
                  fontWeight: 900,
                  fontSize: 13,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase" as const,
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.12) inset",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Enter the Outdoors
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════
          PHASE 1 — Hero overlay (on top, auto-fades after 2.5 s)
          ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {phase === "hero" && (
          <motion.div
            key="hero-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: "easeInOut" }}
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
          >
            {/* Same hero image (crisp, above the base layer) */}
            <img
              src="/hero-bg.png"
              alt=""
              draggable={false}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "center top",
                pointerEvents: "none",
              }}
            />

            {/* Dark gradient over lower portion for text readability */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to bottom, transparent 38%, rgba(0,0,0,0.72) 100%)",
              pointerEvents: "none",
            }} />

            {/* Branding near bottom */}
            <div style={{
              position: "absolute",
              bottom: "calc(env(safe-area-inset-bottom) + 72px)",
              left: 0, right: 0,
              textAlign: "center",
              padding: "0 24px",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500,
                letterSpacing: "0.24em",
                textTransform: "uppercase" as const,
                color: "rgba(237,217,176,0.70)",
                marginBottom: 6,
              }}>
                Welcome to
              </div>
              <div style={{
                fontFamily: "var(--font-display, serif)",
                fontWeight: 900,
                fontSize: "clamp(28px, 8.5vw, 44px)",
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
                color: "#EDD9B0",
                textShadow: "0 2px 22px rgba(0,0,0,0.85)",
              }}>
                MY DIGITAL<br />OUTDOORS
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer links — visible in idle phase only ── */}
      <div style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        zIndex: 220,
        opacity: phase === "idle" ? 1 : 0,
        pointerEvents: phase === "idle" ? "auto" : "none",
        transition: "opacity 0.4s ease",
      }}>
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.22)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Privacy Policy</a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.22)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Support</a>
      </div>
    </motion.div>
  );
}
