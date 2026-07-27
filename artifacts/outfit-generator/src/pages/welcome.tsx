/**
 * WelcomePage — hero image splash screen.
 *
 * Full-screen photo with a gradient overlay, title, and CTA button.
 * Tapping the button fades the whole screen out then calls onEnter().
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

export default function WelcomePage({ onEnter }: Props) {
  const [exiting, setExiting] = useState(false);
  const calledRef = useRef(false);

  const handleOpen = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => {
      if (calledRef.current) return;
      calledRef.current = true;
      onEnter();
    }, 600);
  }, [exiting, onEnter]);

  return (
    <motion.div
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.6, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Hero image ── */}
      <img
        src="/hero-bg.png"
        alt=""
        draggable={false}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      {/* ── Gradient overlay — darkens bottom so text is readable ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.72) 75%, rgba(0,0,0,0.88) 100%)",
        pointerEvents: "none",
      }} />

      {/* ── Bottom content ── */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 60px)",
        paddingLeft: 24, paddingRight: 24,
        gap: 6,
        zIndex: 4,
      }}>
        {/* Title */}
        <div style={{
          fontFamily: "var(--font-display, serif)",
          fontWeight: 900,
          fontSize: "clamp(30px, 9vw, 48px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.08,
          color: "#F5EDD8",
          textAlign: "center",
          textShadow: "0 2px 18px rgba(0,0,0,0.55)",
        }}>
          MY DIGITAL<br />OUTDOORS
        </div>

        {/* Sub-label */}
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.24em",
          textTransform: "uppercase" as const,
          color: "rgba(245,237,216,0.45)",
          textAlign: "center",
          marginBottom: 20,
        }}>
          your outdoor kit collection
        </div>

        {/* CTA */}
        <motion.button
          onClick={handleOpen}
          whileTap={{ scale: 0.96 }}
          style={{
            fontFamily: "var(--font-display, sans-serif)",
            fontWeight: 800, fontSize: 16,
            letterSpacing: "0.03em",
            color: "#2A1608",
            background: "linear-gradient(to bottom, #EED9A8, #C49448)",
            border: "1.5px solid #A07030",
            borderRadius: 100,
            padding: "14px 48px",
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(100,60,20,0.5), 2px 2px 0 rgba(0,0,0,0.6)",
            whiteSpace: "nowrap",
            pointerEvents: exiting ? "none" : "auto",
          }}
        >
          Open My Kit ✨
        </motion.button>
      </div>

      {/* ── Footer links ── */}
      <div style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        zIndex: 210,
        pointerEvents: exiting ? "none" : "auto",
      }}>
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Privacy Policy</a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Support</a>
      </div>
    </motion.div>
  );
}
