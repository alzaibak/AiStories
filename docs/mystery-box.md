# Mystery Box — Phase 1 (data model + backend)

A limited-window seasonal bundle shipped to the buyer. Every buyer of a box receives
the same defined list of items; only the presentation is a surprise. No random
contents are implemented (`allowRandomItems` exists, defaults to `false`, and is not
read anywhere).

## What was reused

| Existing piece | Reuse |
|---|---|
| `Book` | `ebook` / `printed_book` items point at it through `referenceId`; ebooks become `Entitlement` rows. |
| `StoreOrder` / `StoreOrderItem` | **Not** used as the box order. `StoreOrderItem.bookId` is required, so a box cannot honestly be a store order. `MysteryBoxPurchase` is its own order record with a nullable `orderId` for a future link. |
| `Entitlement` | Reused for ebooks, story rentals and premium days. New `premium` resource type and `mysteryBoxPurchaseId` link (for exact revocation on refund). |
| `Subscription` | Not created for premium days because it requires a `planId`; a `premium` entitlement is checked next to subscriptions in `contentAccess.canAccessPart`. |
| Stripe Checkout | `createStripeClient`, `toMinorUnits`, `shipping_options`, address collection, customer creation pattern, session metadata + `client_reference_id`. |
| Webhook | The existing `/api/v1/payments/webhook` (raw body + signature + `ProcessedWebhookEvent` idempotency) now settles boxes on `checkout.session.completed`, cancels on expiry/failure and refunds on `charge.refunded`. |
| Email service | `sendTemplateEmail` + two new seeded templates (`mystery_box_purchase`, `mystery_box_shipping`), localized ar/en/fr with Arabic fallback. |
| Admin auth/RBAC/audit | `authenticate`, `allowRoles('ADMIN','SUPER_ADMIN')`, `recordAudit` with `CREATE/UPDATE/ACTIVATE/SCHEDULE/DUPLICATE/DELETE/SHIP_MYSTERY_BOX`. |
| Shipping/address | Same JSON address shape as `StoreOrder`, populated from Stripe `collected_information.shipping_details`, plus phone from `customer_details.phone`. |
| i18n | Base Arabic columns + `translations` JSON (`en`, `fr`) exactly like books/stories; no automatic translation. |
| Stripe refunds | `charge.refunded` handler now also calls the box refund path (revokes entitlements, deactivates generated promo codes, flags return needed). |

## Tables (migration 025, repairs 026–027)

- `mystery_boxes` — slug, Arabic title/tagline/description/terms + translations, season, status, start/end (UTC), timezone label, priority, price/early bird, currency, compare-at value, stock limit/sold/reserved, per-user limit, reveal mode, FAQ, digital consent wording, computed `requiresShipping`, view/header-click counters, `createdBy`.
- `mystery_box_items` — type, `referenceId`, quantity, `durationDays`, display name/teaser + translations, estimated value, image, hidden-before-purchase, order, weight, own `itemStock`, SKU.
- `mystery_box_shipping` — flat fee, free threshold, allowed countries (default `FR`), per-country overrides, delivery min/max, carrier, note + translations, ships-from, shipping start date.
- `mystery_box_appearance` — header label + translations, icon, gradient/accent, animation style, countdown toggle, almost-sold-out threshold, hero image, pattern style.
- `mystery_box_purchases` — buyer, Stripe ids, status, amounts, price tier, address, consent + timestamp, per-item fulfillment JSON, box snapshot, shipping status/tracking, return-needed, reveal time, reservation expiry.
- `mystery_box_notify_requests` — email/user/language per box, unique per box+email.

Snapshots matter: contents and prices at purchase time are stored on the purchase, so
editing a box later cannot change what a buyer already bought.

## Rules enforced server-side

- **Window**: `computeMysteryBoxState` is used by every public read and by checkout. Cron (`refreshMysteryBoxStatuses`) also flips scheduled→active→ended. A late cron can never allow a sale outside the window; a payment created before `endAt` is still honoured by the webhook.
- **Sold out**: computed from `stockLimit - stockSold - stockReserved`, never a stored fake flag.
- **Price**: computed from the box row at checkout; early-bird applies only before the real `earlyBirdEndsAt`. The client never sends a price.
- **Shipping country lock**: the fee is computed for the submitted country and Stripe address collection is restricted to that single country, so a buyer cannot switch country after the fee is calculated. Physical boxes without a shipping row or a positive stock limit are rejected at checkout as well as at activation.
- **Duplicate**: copies contents, shipping, appearance, translations and the digital-consent wording; dates, sales counters, views and status reset to a new draft.
- **Stock**: reservation row-locks the box and physical item rows, increments `stockReserved`, decrements `itemStock`, and expires after 31 minutes (Stripe's minimum checkout expiry is 30). Payment moves reserved → sold; expiry/failure releases and restores item stock. Cron also releases abandoned reservations.
- **Per-user limit**: counts paid/fulfilled plus live pending reservations.
- **Activation checklist**: Arabic title, ≥1 item, valid price/currency, valid end > start, header label + hex colours, and for physical boxes a stock limit, shipping settings, allowed country, delivery estimate, and `itemStock ≥ quantity × stockLimit` for items that track stock.
- **Edits after first sale**: changes to items/price/stock return `409 BOX_HAS_SALES` unless `acknowledgeSales: true`; slug changes are locked.
- **Digital consent**: required when the box contains any non-physical item, stored with timestamp and the wording shown at purchase.
- **Reveal**: `full` shows everything; `teaser` shows item category + teaser; `hidden_until_purchase` hides name/category. Hidden items reveal after a paid purchase.

## Public API (`/api/v1`)

| Method | Path | Notes |
|---|---|---|
| GET | `/mystery-box/active` | Highest-priority active box header payload, 30 s cache, `{box:null}` when none/sold out. |
| GET | `/mystery-box/:slug` | Details + masked items + shipping fees per country + purchase state; `?lang=`. |
| POST | `/mystery-box/:slug/checkout` | Reader auth, `{language,country,digitalContentConsent}` → Stripe URL. |
| GET | `/mystery-box/purchases/:id` | Buyer's purchase, contents revealed once paid. |
| GET | `/me/mystery-boxes` | Buyer history with contents, fulfillment and shipping. |
| POST | `/mystery-box/:slug/notify` | Email opt-in for the next box. |
| POST | `/mystery-box/:slug/track` | `{event:"view"｜"header_click"}` for conversion stats. |

## Admin API (`/api/v1/admin/mystery-boxes`, ADMIN/SUPER_ADMIN)

`GET /` (filters `q,status,state,page,limit`, sales + revenue) · `POST /` · `GET /:id` ·
`PATCH /:id` · `DELETE /:id` (no purchases only) · `POST /:id/duplicate` ·
`POST /:id/schedule` · `POST /:id/activate` · `POST /:id/deactivate` ·
`POST /:id/archive` · `GET /:id/stats` · `GET /:id/purchases?shippingStatus=` ·
`PATCH /purchases/:purchaseId/shipping` (tracking/carrier, sends email) ·
`GET /:id/export.csv`.

## Operations

- Migrations run automatically on API start (`npm run migrate` also works).
- Cron interval: `MYSTERY_BOX_POLL_INTERVAL_MS` (default 60000, min 5000).
- `allowRandomItems` is intentionally unused. Do not implement random contents without an explicit product decision: the promise is identical contents for every buyer.
- The "next box" email is **not** sent yet; requests are stored so Phase 2/3 can add an admin action.

## Phase 1 scope

Done: migrations, models, reservations, Stripe checkout + webhook settlement,
fulfillment, refunds, emails, admin API, public API, pure/domain tests.

Not in this phase: admin screens, header chip, details page, seed data and the
full QA matrix (Phases 2–4).
