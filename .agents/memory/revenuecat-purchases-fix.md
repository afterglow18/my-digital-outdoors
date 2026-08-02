---
name: RevenueCat purchases fix — getProducts over getOfferings
description: Why the paywall was stuck on "Loading Plans…" and what fixed it
---

# RevenueCat purchases fix

## The rule
Use `Purchases.getProducts({ productIdentifiers: [...] })` directly instead of `Purchases.getOfferings()` in the paywall. Then call `Purchases.purchaseStoreProduct({ product })` with the returned product object.

**Why:** `getOfferings()` adds an extra RC network/cache hop on top of StoreKit. If RC's offerings pipeline is slow or stale the paywall hangs forever. `getProducts()` goes straight to StoreKit and returns prices in one call.

**How to apply:** Any time a new paywall or purchase button is added, call `getProducts` with the exact ASC product identifiers. Do not rely on offerings being loaded first.

## ASC product IDs for this app
- `22_monthly` — Monthly subscription ($1.99/mo)
- `23_yearly` — Yearly subscription ($19.99/yr), in subscription group "outdoors"
- `24_lifetime` — Lifetime non-consumable ($9.99)

These are hardcoded in `src/lib/revenuecat.tsx` as `PRODUCT_IDS`.

## RC entitlement identifier
`"My Digital Outdoors Pro"` — must match exactly (case-sensitive) in both RC dashboard and `REVENUECAT_ENTITLEMENT_IDENTIFIER` constant.

## What was ruled out
- Symlink/binary issue — plugin compiled correctly from the start
- RC dashboard misconfiguration — offerings, packages, and entitlements were all correct
- Sandbox Apple ID — sandbox was working for other apps
- Bundle ID mismatch — both RC and ASC had `com.mydigitaloutdoors.app`
- Subscription group missing — monthly/yearly were correctly in group "outdoors"

## Root cause
`getOfferings()` was not returning data. The exact reason was never confirmed (RC pipeline race on cold start) because switching to `getProducts()` fixed it before the diagnostic error could be captured.
