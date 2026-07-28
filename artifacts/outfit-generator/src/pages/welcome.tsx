/**
 * WelcomePage — Cabin door splash screen.
 *
 * IDLE    : Full-screen closed wooden cabin door. Title + "Open Cabin" button.
 * OPENING : Door swings open on left hinge (rotateY 0 → -110°, 0.88 s).
 *           Hero image (hero-bg.png) is revealed behind.
 * EXITING : Whole screen fades out → onEnter().
 */
import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

// ── Cabin door face ────────────────────────────────────────────────────────────
function DoorFace() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>

      {/* ── Base wood colour ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(175deg, #6B3C1A 0%, #3D1E08 35%, #523018 65%, #2A1006 100%)",
      }} />

      {/* ── Horizontal plank seams ── */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `repeating-linear-gradient(
          to bottom,
          transparent 0px, transparent 58px,
          rgba(0,0,0,0.22) 58px, rgba(0,0,0,0.22) 61px
        )`,
        pointerEvents: "none",
      }} />

      {/* ── Subtle vertical wood grain ── */}
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

      {/* ── Door frame inset border ── */}
      <div style={{
        position: "absolute",
        top: 14, left: 14, right: 14, bottom: 14,
        border: "5px solid rgba(0,0,0,0.32)",
        borderRadius: 3,
        boxShadow: "inset 0 0 28px rgba(0,0,0,0.38), 0 0 18px rgba(0,0,0,0.25)",
        pointerEvents: "none",
      }} />

      {/* ── App title ── */}
      <div style={{
        position: "absolute",
        top: "16%",
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

      {/* ── Raised panels ── */}

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

      {/* ── Strap hinges (left edge) ── */}
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
          {/* Bolt heads */}
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

      {/* ── Door knob (right side, ~56 % down) ── */}
      <div style={{
        position: "absolute",
        right: "9%",
        top: "56%",
        transform: "translateY(-50%)",
      }}>
        {/* Knob plate */}
        <div style={{
          width: 14, height: 34,
          background: "linear-gradient(to right, #8A6020, #C8900C, #8A6020)",
          borderRadius: 4,
          marginBottom: -2,
          position: "relative", left: 7,
          boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }} />
        {/* Knob sphere */}
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #F0D060, #9A7020)",
          border: "2px solid #5A3A08",
          boxShadow: "0 3px 10px rgba(0,0,0,0.65), inset 0 1px 3px rgba(255,255,255,0.32)",
        }} />
      </div>

      {/* ── Right-edge shadow (thickness illusion) ── */}
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
  const [phase, setPhase] = useState<"idle" | "opening" | "exiting">("idle");
  const calledRef = useRef(false);

  const handleOpen = useCallback(() => {
    if (phase !== "idle") return;
    setPhase("opening");
    // Start fade-out shortly after door is fully open
    setTimeout(() => setPhase("exiting"), 1050);
    setTimeout(() => {
      if (calledRef.current) return;
      calledRef.current = true;
      onEnter();
    }, 1700);
  }, [phase, onEnter]);

  const doorOpen = phase !== "idle";

  return (
    <motion.div
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.6, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        overflow: "hidden",
        background: "#060302",
      }}
    >
      {/* ── Hero image — always behind, revealed as door swings open ── */}
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

      {/* ── Dark exterior overlay — fades as door opens ── */}
      <motion.div
        style={{ position: "absolute", inset: 0, background: "#040100", pointerEvents: "none" }}
        animate={{ opacity: doorOpen ? 0 : 0.92 }}
        transition={{ duration: 0.85, delay: 0.25 }}
      />

      {/* ── Perspective container → 3-D door swing ── */}
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
          transition={{ duration: 0.88, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <DoorFace />
        </motion.div>
      </div>

      {/* ── Bottom CTA — fades + slides down as door opens ── */}
      <motion.div
        animate={{ opacity: doorOpen ? 0 : 1, y: doorOpen ? 14 : 0 }}
        transition={{ duration: 0.28 }}
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom) + 54px)",
          left: 0, right: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 8,
          zIndex: 20,
          pointerEvents: doorOpen ? "none" : "auto",
        }}
      >
        <p style={{
          margin: 0,
          fontSize: 11, fontWeight: 500,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "rgba(245,237,216,0.38)",
        }}>
          your outdoor kit collection
        </p>
        <motion.button
          onClick={handleOpen}
          whileTap={{ scale: 0.95 }}
          style={{
            marginTop: 6,
            fontFamily: "var(--font-display, sans-serif)",
            fontWeight: 800, fontSize: 16,
            letterSpacing: "0.03em",
            color: "#2A1608",
            background: "linear-gradient(to bottom, #EED9A8, #C49448)",
            border: "1.5px solid #A07030",
            borderRadius: 100,
            padding: "14px 44px",
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(100,60,20,0.50), 2px 2px 0 rgba(0,0,0,0.55)",
            whiteSpace: "nowrap",
          }}
        >
          Open Cabin
        </motion.button>
      </motion.div>

      {/* ── Footer links ── */}
      <div style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        zIndex: 210,
        pointerEvents: doorOpen ? "none" : "auto",
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
