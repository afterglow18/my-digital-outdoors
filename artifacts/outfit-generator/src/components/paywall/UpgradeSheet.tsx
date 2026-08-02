/**
 * UpgradeSheet — three-tier paywall (Monthly / Yearly / Lifetime).
 *
 * Uses Purchases.getProducts() directly with hardcoded ASC product IDs —
 * bypasses the RC offerings/packages layer entirely so StoreKit is hit
 * without any intermediate RC config dependency.
 *
 * ASC product IDs:
 *   22_monthly  → Monthly  $1.99
 *   23_yearly   → Yearly   $19.99
 *   24_lifetime → Lifetime $9.99 (one-time)
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { useSubscription } from "@/lib/revenuecat";

export type UpgradeReason = "items" | "outfits" | "mannequin";
type TierId = "monthly" | "yearly" | "lifetime";

interface Props {
  reason:  UpgradeReason;
  onClose: () => void;
}

// ── Copy ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  "Unlimited gear items",
  "Unlimited saved kits",
  "Save all your gear",
  "One-time payment options",
  "Choose monthly, yearly or lifetime!",
] as const;
void FEATURES;

const HEADLINES: Record<UpgradeReason, string> = {
  items:     "UNLOCK YOUR UNLIMITED OUTDOOR KIT",
  outfits:   "UNLOCK YOUR UNLIMITED OUTDOOR KIT",
  mannequin: "UNLOCK YOUR UNLIMITED OUTDOOR KIT",
};

const SUBTITLES: Record<UpgradeReason, string> = {
  items:     "You've reached the free 20 item limit.\nUpgrade once, gear up forever.",
  outfits:   "You've hit the free kit limit. Upgrade to save every kit.",
  mannequin: "A premium feature — unlock it once.",
};

// ── Tier config ───────────────────────────────────────────────────────────────
// productId must match the ASC In-App Purchase identifier exactly.

const TIER_CONFIG: Record<TierId, {
  label:     string;
  fallback:  string;   // shown while StoreKit loads
  period:    string;
  notes:     [string, string];
  productId: string;   // ASC product identifier
  best?:     true;
}> = {
  monthly:  { label: "MONTHLY",  fallback: "$1.99",  period: "/month",   notes: ["Cancel anytime", "Billed monthly"], productId: "22_monthly"  },
  yearly:   { label: "YEARLY",   fallback: "$19.99", period: "/year",    notes: ["Save 17%",       "Billed yearly"],  productId: "23_yearly"   },
  lifetime: { label: "LIFETIME", fallback: "$9.99",  period: "one-time", notes: ["Pay once",       "Yours forever"],  productId: "24_lifetime", best: true },
};

const TIER_ORDER: TierId[] = ["monthly", "yearly", "lifetime"];

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findProduct(products: unknown[] | null, productId: string): any | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (products ?? []).find((p: any) => p.identifier === productId) ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function livePrice(products: unknown[] | null, productId: string, fallback: string): string {
  return findProduct(products, productId)?.priceString ?? fallback;
}

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({
  id, selected, onSelect, price, period, notes, label, best,
}: {
  id: TierId; selected: boolean; onSelect: (id: TierId) => void;
  price: string; period: string; notes: [string, string]; label: string; best?: true;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      className="flex-1 flex flex-col rounded-xl border-[3px] transition-all relative overflow-hidden text-left"
      style={{
        borderColor: selected ? "#000" : "#C9BAA5",
        background:  selected ? "hsl(24 100% 44%)" : "hsl(24 50% 92%)",
        boxShadow:   selected ? "3px 3px 0px 0px rgba(0,0,0,1)" : "none",
      }}
    >
      {best && (
        <span
          className="absolute top-0 right-0 text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-bl-lg"
          style={{ background: "#C0390B", color: "#fff" }}
        >
          BEST ★ VALUE
        </span>
      )}
      <div className="px-2.5 pt-3 pb-2.5 flex flex-col gap-1">
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/50">{label}</p>
        <p className="font-display font-bold text-[1.3rem] leading-none text-black">{price}</p>
        <p className="text-[9px] font-semibold text-black/45">{period}</p>
        <ul className="flex flex-col gap-0.5 mt-1.5">
          {notes.map((n) => (
            <li key={n} className="flex items-center gap-1">
              <Check className="w-2.5 h-2.5 shrink-0 text-black/60" strokeWidth={3} />
              <span className="text-[8.5px] font-semibold text-black/55 leading-tight">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

export function UpgradeSheet({ reason, onClose }: Props) {
  const {
    products, productsError, productsAttempts,
    purchase, restore, isRestoring, isLoading,
  } = useSubscription();
  const qc = useQueryClient();

  const [selected,    setSelected]    = useState<TierId>("lifetime");
  const [status,      setStatus]      = useState<"idle" | "pending" | "error">("idle");
  const [pkgTimedOut, setPkgTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // True once StoreKit has returned at least the selected product.
  const selectedProduct = findProduct(products, TIER_CONFIG[selected].productId);
  const productsReady   = !!selectedProduct;

  const prices: Record<TierId, string> = {
    monthly:  livePrice(products, "22_monthly",  "$1.99"),
    yearly:   livePrice(products, "23_yearly",   "$19.99"),
    lifetime: livePrice(products, "24_lifetime", "$9.99"),
  };

  // After 30 s without products, flip to "Tap to Retry" — but only if at
  // least one attempt has been made (so we don't cut off a slow first fetch).
  const showRetry = pkgTimedOut && (productsAttempts > 0 || !!productsError);

  useEffect(() => {
    if (productsReady) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPkgTimedOut(false);
      return;
    }
    setPkgTimedOut(false);
    timeoutRef.current = setTimeout(() => {
      setPkgTimedOut(true);
      console.warn("[Paywall] 30 s elapsed — StoreKit products still not ready");
    }, 30_000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [productsReady]);

  const ctaLabel =
    status === "pending"                   ? "Opening…"
    : status === "error"                   ? "Tap to Try Again"
    : showRetry                            ? "Tap to Retry"
    : isLoading || !productsReady          ? "Loading Plans…"
    : selected === "lifetime"              ? `UNLOCK FOREVER – ${prices.lifetime} ›`
    : selected === "yearly"               ? `SUBSCRIBE – ${prices.yearly}/YR ›`
    :                                        `SUBSCRIBE – ${prices.monthly}/MO ›`;

  const handlePurchase = useCallback(async () => {
    if (status === "pending") return;
    if (status === "error") { setStatus("idle"); return; }
    if (showRetry) {
      setPkgTimedOut(false);
      qc.invalidateQueries({ queryKey: ["revenuecat", "products"] });
      return;
    }
    if (isLoading) return;
    setStatus("pending");

    // Grab product from cache; if not there yet kick a refetch and wait up to 8 s.
    let product = findProduct(
      qc.getQueryData<unknown[]>(["revenuecat", "products"]) ?? null,
      TIER_CONFIG[selected].productId,
    );
    if (!product) {
      qc.invalidateQueries({ queryKey: ["revenuecat", "products"] });
      let waited = 0;
      while (!product && waited < 8000) {
        await new Promise<void>(r => setTimeout(r, 500));
        waited += 500;
        product = findProduct(
          qc.getQueryData<unknown[]>(["revenuecat", "products"]) ?? null,
          TIER_CONFIG[selected].productId,
        );
      }
    }

    if (!product) {
      console.error("[Paywall] StoreKit product not found after waiting — tier:", selected,
        "productId:", TIER_CONFIG[selected].productId);
      setStatus("error");
      return;
    }

    try {
      await purchase(product);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("cancel") || msg.includes("dismiss")) {
        setStatus("idle");
      } else {
        console.error("[Paywall] Purchase error:", err);
        setStatus("error");
      }
    }
  }, [status, isLoading, selected, purchase, onClose, qc, showRetry]);

  // CSS plaid pattern — burnt orange base with dark cross-bands and fine thread lines
  const plaidBg = [
    "repeating-linear-gradient(90deg, transparent 0,transparent 36px, rgba(80,15,0,0.28) 36px,rgba(80,15,0,0.28) 54px, transparent 54px,transparent 90px, rgba(80,15,0,0.28) 90px,rgba(80,15,0,0.28) 108px)",
    "repeating-linear-gradient(0deg,  transparent 0,transparent 36px, rgba(80,15,0,0.28) 36px,rgba(80,15,0,0.28) 54px, transparent 54px,transparent 90px, rgba(80,15,0,0.28) 90px,rgba(80,15,0,0.28) 108px)",
    "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0,rgba(255,255,255,0.07) 2px, transparent 2px,transparent 18px)",
    "repeating-linear-gradient(0deg,  rgba(255,255,255,0.07) 0,rgba(255,255,255,0.07) 2px, transparent 2px,transparent 18px)",
    "#C54400",
  ].join(", ");

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto"
      style={{ background: "#F8F4ED" }}
    >
      {/* ── Plaid orange header ── */}
      <div
        className="relative flex-shrink-0 flex flex-col items-center justify-end pb-4"
        style={{
          background: plaidBg,
          paddingTop: "max(2.5rem, env(safe-area-inset-top))",
          minHeight: 120,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-0 right-3 w-9 h-9 rounded-full border-2 border-white/40 flex items-center justify-center
                     bg-black/20 active:bg-black/35 transition-all"
          style={{ top: "max(0.6rem, calc(env(safe-area-inset-top) + 0.25rem))" }}
        >
          <X className="w-4 h-4 text-white" />
        </button>

        {/* Badge */}
        <div style={{ textAlign: "center" }}>
          <p className="text-white/70 font-bold uppercase tracking-[0.22em]" style={{ fontSize: 9 }}>
            My Digital Outdoors
          </p>
          <p className="text-white font-display font-bold uppercase tracking-wide mt-0.5" style={{ fontSize: 15 }}>
            ⛺ Go Premium
          </p>
        </div>
      </div>

      {/* Content — fills remaining height, no scroll */}
      <div className="flex-1 min-h-0 flex flex-col justify-between px-5 pt-3 pb-2">

        {/* Headline */}
        <div>
          <h1 className="font-display font-bold text-[1.9rem] uppercase tracking-tight leading-[0.88]">
            {HEADLINES[reason]}
          </h1>
          <p className="text-xs font-semibold text-black/45 mt-1.5" style={{ whiteSpace: "pre-line" }}>
            {SUBTITLES[reason]}
          </p>
        </div>

        {/* Features card */}
        <div className="rounded-2xl border-[3px] border-black overflow-hidden" style={{ background: "#111" }}>
          <div className="px-4 py-4 flex flex-col gap-2">
            <p className="font-display font-bold uppercase text-[1.45rem] leading-[0.92] tracking-tight"
               style={{ color: "hsl(24 100% 44%)" }}>
              Unlimited gear collections
            </p>
            <p className="text-white/60 text-xs font-medium mt-1 leading-snug">
              All your gear, beautifully organized — forever.
            </p>
          </div>
        </div>

        {/* Plan selector */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-black/35 text-center mb-1.5">
            Choose Your Plan
          </p>
          <div className="flex gap-2">
            {TIER_ORDER.map((id) => {
              const t = TIER_CONFIG[id];
              return (
                <TierCard
                  key={id}
                  id={id}
                  selected={selected === id}
                  onSelect={setSelected}
                  label={t.label}
                  price={prices[id]}
                  period={t.period}
                  notes={t.notes}
                  best={t.best}
                />
              );
            })}
          </div>
        </div>

      </div>

      {/* CTA footer */}
      <div
        className="px-5 pt-2 flex flex-col gap-2 flex-shrink-0"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handlePurchase}
          disabled={status === "pending" || (!showRetry && (isLoading || !productsReady) && status !== "error")}
          className="w-full py-3.5 rounded-2xl font-display font-bold text-lg uppercase
                     tracking-tight border-[3px] border-black text-black
                     active:translate-x-0.5 active:translate-y-0.5 transition-all
                     disabled:opacity-60 disabled:cursor-not-allowed bg-primary"
          style={{
            boxShadow: status === "pending" ? "none" : "4px 4px 0px 0px rgba(0,0,0,1)",
          }}
        >
          {ctaLabel}
        </button>

        {/* Diagnostic — visible in TestFlight without Xcode.
            Shows plugin availability + StoreKit error after 3 attempts. */}
        {!productsReady && (pkgTimedOut || productsAttempts > 0 || !!productsError) && (
          <p className="text-[10px] text-center text-red-600/70 leading-tight px-2 -mt-1 break-all">
            plugin:{Capacitor.isPluginAvailable("Purchases") ? "✓" : "✗"}
            {" · "}attempts:{productsAttempts}
            {productsError ? ` · ${productsError.message}` : " · loading…"}
          </p>
        )}

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onClose}
            className="text-sm font-semibold text-black/35 text-center hover:text-black/55 transition-colors"
          >
            Maybe Later
          </button>
          <span className="text-black/20 text-sm">·</span>
          <button
            onClick={() => restore()}
            disabled={isRestoring}
            className="text-sm font-semibold text-black/35 text-center hover:text-black/55 transition-colors disabled:opacity-50"
          >
            {isRestoring ? "Restoring…" : "Restore Purchases"}
          </button>
        </div>

        {/* Legal links — required by Apple */}
        <div className="flex items-center justify-center gap-3 pb-1">
          <button
            onClick={() => window.open("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/", "_blank", "noopener")}
            className="text-[10px] font-medium text-black/30 hover:text-black/50 transition-colors underline underline-offset-2"
          >
            Terms of Use
          </button>
          <span className="text-black/20 text-[10px]">·</span>
          <button
            onClick={() => window.open("https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link", "_blank", "noopener")}
            className="text-[10px] font-medium text-black/30 hover:text-black/50 transition-colors underline underline-offset-2"
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </motion.div>
  );
}
