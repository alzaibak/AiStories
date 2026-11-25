# Payments / Orders / Books / Donations remediation

Branch: `fix/payments-donations-security`

Legend: [x] done, [~] partial, [ ] todo, [!] blocked (missing credentials).

## Phase 0 — Audit

- [x] Reproduce from code paths and identify root causes.
- [x] Stripe setup: keys, raw webhook body, signature verification, event table gap.
- [x] Local Stripe CLI instructions (README `Paiements Stripe en local`).
- [x] Inventory state writers and client-trusted fields.

## Phase 1 — Payment foundation

- [x] Extend order statuses and add `store_order_events`.
- [x] Add `stripe_events` with payload summary, result, error, processedAt.
- [x] Idempotent shared settlement with amount/currency verification.
- [x] Reconciliation endpoint `GET /orders/:id/status` and session route.
- [x] Scheduled reconciliation for pending orders/donations.
- [x] Admin payments health cards and per-order Stripe sync button.
- [x] Success page polling and paid/failed/timeout states.

## Phase 2 — Cart and downloads

- [x] Server cart routes (get/add/update/remove/merge).
- [x] Server-side price/stock/ownership validation and totals.
- [x] Header cart icon/count, cart page, guest localStorage cart and merge after login.
- [x] Checkout from cart, one order with multiple line items.
- [x] Order confirmation/thank-you route with every download.
- [x] One-time signed download tokens and download log.
- [x] Guest cart localStorage merge UI.

## Phase 3 — Admin orders and books

- [x] Admin order list includes every status, filters/search/pagination.
- [x] Admin order detail DTO with timeline and entitlements.
- [~] Admin order actions: sync, health, CSV/export; manual entitlement grant not exposed in UI.
- [x] Fix book creation validation (empty translations no longer fail).
- [x] Book editor cover upload, alt text, weight/ISBN, preview key, private PDF.
- [x] Public ebook page: no shipping text, cover fallback, cart/buy buttons.

## Phase 4 — Donations backend

- [x] Extend campaign model and add campaign items, places, updates.
- [x] Server-computed tiers/custom amounts and target progress.
- [x] Donation checkout and idempotent paid fulfillment.
- [x] Refunds reduce progress; manual/admin, CSV and admin refund routes.
- [~] Donation receipt exists; campaign-completion and failed-payment emails are partial.
- [~] Recurring lifecycle handled by invoice events; no end-to-end Stripe test run.

## Phase 5 — Donations UI

- [x] Admin campaigns editor, status actions, manual donations, refunds, CSV.
- [x] Public campaign cards/detail with progress, places, updates, tiers, custom amount.
- [x] Remove unconditional junk/test copy from the donation UI; seed now creates a clean 300-book campaign.

## Phase 6 — Tests

- [x] Pure payment/order/cart/donation maths and schema tests (11 new).
- [ ] Webhook signature/idempotency integration tests (need Stripe fixtures/test DB).
- [~] Tamper/IDOR schema tests; full HTTP tamper suite not written.
- [ ] Stripe manual checklist.

## Phase 7 — Security/report

- [x] SecurityEvent model, logging helper, admin route.
- [x] Admin Security log page with severity/type filters and alerts.
- [x] SECURITY.md route matrix and tamper test list.
- [x] README/env update, Stripe CLI instructions, migration 036 note.
- [x] Final report.

## Assumptions

1. EUR is the configured store currency; currency mismatch is rejected.
2. Existing Stripe credentials are not available in this environment, so live Stripe calls cannot be executed locally. Checkout/webhook behaviour is verified by unit/state tests and syntax/startup checks only.
3. Guest cart is stored in localStorage as item ids/quantities only; the server never trusts prices and revalidates at merge/checkout.
4. Campaign progress is always recomputed from paid donations.
5. Existing returns/refund services are reused; admin order refund continues through the existing returns workflow rather than a new duplicate refund engine.
6. Existing legacy order values `pending` and `cancelled` remain readable and normalize to `pending_payment` and `canceled`.