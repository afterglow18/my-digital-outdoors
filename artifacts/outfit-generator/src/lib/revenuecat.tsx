/**
 * RevenueCat integration — using @revenuecat/purchases-capacitor.
 *
 * • On iOS (Capacitor native): full purchase flow via StoreKit.
 * • In browser (Replit preview / web): purchases show "unavailable" gracefully.
 *
 * Premium access is ALWAYS derived from a live RC CustomerInfo fetch.
 * It is never stored in or read from localStorage.
 *
 * CustomerInfo is refreshed:
 *   1. On app launch (initial query mount)
 *   2. On app foreground (appStateChange listener)
 *   3. Immediately after a successful purchase (cache seeded + invalidated)
 *   4. Immediately after Restore Purchases (cache seeded + invalidated)
 *   5. Whenever RC pushes a server-side update (addCustomerInfoUpdateListener)
 *      — this catches refunds, expirations, and subscription lapses in real-time.
 *
 * STATIC IMPORT — do NOT convert back to a dynamic import().
 * Vite turns dynamic import() into a lazy chunk that hangs silently in
 * Capacitor's WKWebView, so configure() is never reached.
 */

import React, { createContext, useContext, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// Static import — required so Vite bundles this into the main chunk.
// Dynamic import() creates a lazy chunk that never resolves in WKWebView.
import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";

// ── Constants ─────────────────────────────────────────────────────────────────

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "My Digital Outdoors Pro";

const RC_TEST_KEY = import.meta.env.VITE_REVENUECAT_TEST_KEY as string | undefined;
const RC_IOS_KEY  = (import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined) ?? "appl_HiuDJfmUByAUKdNtZFavYOnMbwd";

function getApiKey(): string {
  const isNative = Capacitor.isNativePlatform();
  if (isNative && RC_IOS_KEY) return RC_IOS_KEY;
  if (RC_TEST_KEY) return RC_TEST_KEY;
  throw new Error("RevenueCat API key not configured");
}

// ── Initialization ────────────────────────────────────────────────────────────

// Singleton init promise — created once, returned on every subsequent call.
// configure() is fire-and-forget; the promise resolves synchronously right
// after the call is dispatched. The offerings query retry loop handles the
// case where RC's native layer isn't warm yet.
let _rcInitPromise: Promise<void> | null = null;
export let _rcSettled = false;

export function initializeRevenueCat(): Promise<void> {
  if (_rcInitPromise) return _rcInitPromise;

  _rcInitPromise = new Promise<void>((resolve) => {
    const isNative = Capacitor.isNativePlatform();
    const pluginAvailable = Capacitor.isPluginAvailable("Purchases");

    console.log("[RC] initializeRevenueCat — isNative:", isNative,
      "pluginAvailable:", pluginAvailable);

    if (!isNative || !pluginAvailable) {
      if (!isNative) console.log("[RC] browser env — skipping configure");
      if (isNative && !pluginAvailable)
        console.error("[RC] ❌ plugin NOT available — Swift code missing from binary. Check Codemagic symlink-deref step.");
      resolve();
      return;
    }

    const apiKey = RC_IOS_KEY;
    console.log("[RC] apiKey prefix:", apiKey.slice(0, 12));

    // Both fire-and-forget — the Swift→JS bridge response may never arrive
    // on Capacitor + SPM. The native SDK initialises synchronously on receipt.
    Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    Purchases.configure({ apiKey });

    // Resolve immediately — configure() is synchronous on the native side.
    // The React Query retry loop (25 s timeout, 30 retries) handles the window
    // between this resolve and RC being fully ready.
    console.log("[RC] configure() dispatched — resolving init promise");
    resolve();
  });

  _rcInitPromise.then(() => {
    _rcSettled = true;
    console.log("[RC] _rcSettled = true — offerings query unblocked");
  });

  return _rcInitPromise;
}

// ── Query key ─────────────────────────────────────────────────────────────────

const CUSTOMER_INFO_KEY = ["revenuecat", "customer-info"] as const;

// ── Subscription context ──────────────────────────────────────────────────────

function useSubscriptionContext() {
  const qc = useQueryClient();

  // staleTime: 0 — always considered stale so every mount/focus triggers a
  // fresh fetch. The foreground listener below handles mid-session refreshes.
  const customerInfoQuery = useQuery({
    queryKey: CUSTOMER_INFO_KEY,
    queryFn: async () => {
      if (!Capacitor.isNativePlatform()) return null;
      const { customerInfo } = await Purchases.getCustomerInfo();
      return customerInfo;
    },
    staleTime: 0,
    retry: false,
  });

  // ── Direct product fetch — bypasses the offerings layer entirely ──────────────
  // Calls StoreKit directly with the three known product IDs. Simpler, faster,
  // and doesn't depend on RC's offerings/packages pipeline being warm.
  const PRODUCT_IDS = ["22_monthly", "23_yearly", "24_lifetime"] as const;

  const productsQuery = useQuery({
    queryKey: ["revenuecat", "products"],
    queryFn: async () => {
      if (!Capacitor.isNativePlatform()) return null;
      await initializeRevenueCat();
      console.log("[RC] getProducts() attempt — ids:", PRODUCT_IDS.join(", "));
      try {
        const { products } = await Promise.race([
          Purchases.getProducts({ productIdentifiers: [...PRODUCT_IDS] }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("RC getProducts timeout (25s)")), 25000)
          ),
        ]);
        console.log("[RC] getProducts() returned", products.length, "products:",
          products.map((p: { identifier: string; priceString: string }) =>
            `${p.identifier}=${p.priceString}`).join(", ") || "none");
        if (!products.length) {
          throw new Error(`StoreKit returned 0 products for [${PRODUCT_IDS.join(", ")}] — check ASC In-App Purchases status`);
        }
        return products;
      } catch (err) {
        const msg = err instanceof Error
          ? `${err.message} | ${JSON.stringify(err)}`
          : JSON.stringify(err);
        console.error("[RC] getProducts error:", msg);
        throw new Error(msg);
      }
    },
    staleTime: 300 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(2000 * attempt, 6000),
    refetchInterval: (query) =>
      Capacitor.isNativePlatform() && !query.state.data ? 10000 : false,
  });

  // ── Foreground + server-push listeners ─────────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let appListenerHandle: Awaited<ReturnType<typeof import("@capacitor/app").App.addListener>> | null = null;
    let rcCallbackId: string | null = null;

    (async () => {
      // 1. Recheck CustomerInfo every time the app comes back to the foreground.
      try {
        const { App } = await import("@capacitor/app");
        appListenerHandle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            console.log("[RevenueCat] App foregrounded — rechecking CustomerInfo");
            qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY });
          }
        });
      } catch (err) {
        console.warn("[RevenueCat] Could not add appStateChange listener:", err);
      }

      // 2. RC server-push: fires when RC detects a refund, expiry, or any
      //    server-side entitlement change — revokes access in real-time.
      try {
        rcCallbackId = await Purchases.addCustomerInfoUpdateListener(
          (customerInfo) => {
            console.log("[RevenueCat] CustomerInfo pushed from server — updating cache");
            qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
          }
        );
      } catch (err) {
        console.warn("[RevenueCat] Could not add CustomerInfo listener:", err);
      }
    })();

    return () => {
      appListenerHandle?.remove();
      if (rcCallbackId !== null) {
        Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: rcCallbackId })
          .catch(() => {/* non-fatal */});
      }
    };
  }, [qc]);

  // ── Purchase ───────────────────────────────────────────────────────────────
  const purchaseMutation = useMutation({
    mutationFn: async (product: unknown) => {
      if (!Capacitor.isNativePlatform()) throw new Error("Purchases not available in browser");
      const { customerInfo } = await Purchases.purchaseStoreProduct({ product: product as never });
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      // Seed the cache immediately with what RC returned, then schedule
      // delayed re-fetches because RC often reflects entitlements 1-5s
      // after the purchasePackage call resolves.
      qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY }), 2000);
      setTimeout(() => qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY }), 5000);
      setTimeout(() => qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY }), 10000);
    },
  });

  // ── Restore ────────────────────────────────────────────────────────────────
  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!Capacitor.isNativePlatform()) throw new Error("Purchases not available in browser");
      const { customerInfo } = await Purchases.restorePurchases();
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      // Same pattern: seed immediately, then confirm in background.
      qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
    },
  });

  // ── Entitlement check — derived purely from live RC data ───────────────────
  // Never reads localStorage. If customerInfo is null (not yet loaded or
  // browser), isSubscribed is false — safe default to free tier.
  const isSubscribed =
    customerInfoQuery.data?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  const refreshCustomerInfo = () =>
    qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY });

  return {
    customerInfo:        customerInfoQuery.data ?? null,
    // Direct StoreKit products — bypasses offerings layer
    products:            (productsQuery.data ?? null) as unknown[] | null,
    productsError:       (productsQuery.failureReason ?? productsQuery.error) as Error | null,
    productsAttempts:    productsQuery.failureCount,
    isSubscribed,
    isLoading:           customerInfoQuery.isLoading,
    isRefetching:        customerInfoQuery.isFetching,
    purchase:            purchaseMutation.mutateAsync,
    restore:             restoreMutation.mutateAsync,
    refreshCustomerInfo,
    isPurchasing:        purchaseMutation.isPending,
    isRestoring:         restoreMutation.isPending,
    purchaseError:       purchaseMutation.error as Error | null,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be inside <SubscriptionProvider>");
  return ctx;
}
