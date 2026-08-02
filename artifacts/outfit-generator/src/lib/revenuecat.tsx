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

export async function initializeRevenueCat(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const apiKey = getApiKey();
  console.log("[RC] initializeRevenueCat — apiKey prefix:", apiKey.slice(0, 12));

  // setLogLevel is fire-and-forget (non-critical)
  void Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG })
    .then(() => console.log("[RC] setLogLevel ✓"))
    .catch((e) => console.warn("[RC] setLogLevel failed:", e));

  // Fire-and-forget — do NOT await.
  // The Swift→JS bridge response may never arrive on Capacitor + SPM.
  // The native SDK initialises synchronously on message receipt regardless.
  console.log("[RC] calling configure() fire-and-forget…");
  void Purchases.configure({ apiKey })
    .then(() => console.log("[RC] configure() response ✓"))
    .catch((e) => console.error("[RC] configure() error:", e));

  await Promise.resolve(); // one microtask so the message is dispatched
  console.log("[RC] configure() dispatched — SDK initialising natively");
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

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      if (!Capacitor.isNativePlatform()) return null;
      console.log("[RC] getOfferings() attempt…");
      // 8 s per-attempt timeout — short enough that retries happen quickly
      // if RC hasn't finished initialising yet.
      let result: unknown;
      try {
        result = await Promise.race([
          Purchases.getOfferings(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("RC getOfferings timeout")), 8000)
          ),
        ]);
      } catch (err) {
        console.warn("[RC] getOfferings() failed:", err);
        throw err;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (result as any).offerings ?? result ?? null;
      console.log("[RC] getOfferings() result — current:", data?.current?.identifier ?? "null",
        "packages:", data?.current?.availablePackages?.length ?? 0);
      // Treat empty/null as an error so React Query retries rather than
      // caching null as a successful "no offerings" result.
      if (!data?.current) throw new Error("RC offerings not ready");
      return data;
    },
    staleTime: 300 * 1000,
    // Keep retrying — RC configure() can take 10-30 s on first cold launch.
    retry: 30,
    retryDelay: (attempt) => Math.min(2000 * attempt, 6000),
    // Also poll every 5 s while we have no data (covers the case where
    // retries are exhausted but the SDK initialises late).
    refetchInterval: (query) =>
      Capacitor.isNativePlatform() && !query.state.data ? 5000 : false,
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
    mutationFn: async (pkg: unknown) => {
      if (!Capacitor.isNativePlatform()) throw new Error("Purchases not available in browser");
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg as never });
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
    offerings:           offeringsQuery.data ?? null,
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
