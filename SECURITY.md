# Security model — payments, orders, books and donations

## Principles

- The client sends identifiers and intents only. Prices, totals, discounts, shipping, currency, order/donation status, entitlement data and user ids are resolved server-side from the database.
- Every quote is recalculated when the cart is read and again when the order is created. A Stripe webhook or reconciliation is accepted only when `amount_total` and `currency` equal the stored order/donation values.
- Orders, downloads, donations, returns and carts are owner-scoped. Admin routes require `ADMIN` or `SUPER_ADMIN` (`authenticate` + `allowRoles`).
- Money is integer minor units end to end. Donation progress is recomputed from paid donations, never incremented by a request counter.
- Blocked tampering is written to `security_events`; high/critical events also alert `SECURITY_ALERT_EMAIL` and the admin accounts.

## Route matrix

Legend: **R** reader token, **A** admin token, **P** public, **W** Stripe signature. “Strict schema” means unknown fields are rejected.

| Method | Path | Auth | Ownership / role | Validated fields | Limit |
|---|---|---|---|---|---|
| GET | `/api/v1/books` | P | published only | `lang`, `limit` | global |
| GET | `/api/v1/books/:slug` | P | published only | slug | global |
| POST | `/api/v1/books/:slug/download-token` | R | active entitlement for that book; quota | slug | downloads 30/min |
| GET | `/api/v1/downloads/:token` | token | one-time hashed token, owner entitlement, expiry, quota | token | downloads 30/min |
| GET | `/api/v1/cart` | R | own cart | — | cart 60/min |
| POST | `/api/v1/cart/items` | R | own cart; ebook ownership/stock rules | strict `bookId`, `quantity` | cart 60/min |
| PATCH | `/api/v1/cart/items/:bookId` | R | own cart; ebook quantity 1; stock | strict `quantity` | cart 60/min |
| DELETE | `/api/v1/cart/items/:bookId` | R | own cart | integer book id | cart 60/min |
| DELETE | `/api/v1/cart` | R | own cart | — | cart 60/min |
| POST | `/api/v1/cart/merge` | R | own cart; guest ids only | strict array of `{bookId, quantity}` | cart 60/min |
| POST | `/api/v1/payments/books/checkout` | R | own order; book availability; idempotency key | strict `items[]`, `language`, `promoCode`, `digitalConsent`, `shippingAddress` | payments 20/min |
| GET | `/api/v1/orders` | R | own orders | page/limit | payments 20/min |
| GET | `/api/v1/orders/:id` | R | own order (404 otherwise) | integer id | payments 20/min |
| GET | `/api/v1/orders/:id/status` | R | own order; Stripe reconciliation | integer id | payments 20/min |
| GET | `/api/v1/payments/session/:sessionId` | R | own session only; reconciliation | session id | payments 20/min |
| POST | `/api/v1/donation-campaigns/:id/checkout` | R | active campaign; server amount/tier | strict `amount`/`tierId`, `language`, `recurring`, `isAnonymous`, `message` | donation 20/min |
| POST | `/api/v1/donations/checkout` | R | platform support; server amount/currency | strict `amount`, `language`, `recurring`, `isAnonymous`, `message` | donation 20/min |
| GET | `/api/v1/donation-campaigns` | P | active/completed only | `lang`, `limit` | donation 20/min |
| GET | `/api/v1/donation-campaigns/:slug` | P | active/completed only | slug | donation 20/min |
| GET | `/api/v1/my-donations` | R | own donations | page | global |
| POST | `/api/v1/payments/webhook` | W | raw body signature; event id idempotency; amount/currency check | Stripe payload | global |
| GET | `/api/v1/admin/store-orders` | A | all orders | status/type/date/search/page | global |
| GET | `/api/v1/admin/store-orders/:id` | A | all orders | integer id | global |
| POST | `/api/v1/admin/store-orders/:id/sync` | A | Stripe reconciliation, audit | integer id | global |
| PATCH | `/api/v1/admin/store-orders/:id/fulfillment` | A | paid/fulfilled only; no backwards state | strict `fulfillmentStatus`, `trackingNumber` | global |
| GET | `/api/v1/admin/payments/health` | A | configuration/status only | — | global |
| POST | `/api/v1/admin/entitlements/:id/reset-downloads` | A | audit-logged counter reset | integer id | global |
| POST | `/api/v1/admin/entitlements/:id/revoke` | A | reason required; audit-logged | integer id, `reason` | global |
| POST | `/api/v1/admin/money/donation-campaigns` | A | create campaign; whitelisted fields | campaign schema | global |
| PATCH | `/api/v1/admin/money/donation-campaigns/:id` | A | campaign ownership by role; audit | partial campaign schema | global |
| POST | `/api/v1/admin/money/donation-campaigns/:id/recompute` | A | paid donations only; audit | integer id | global |
| POST | `/api/v1/admin/money/donation-campaigns/:id/duplicate` | A | draft copy; audit | integer id | global |
| GET | `/api/v1/admin/money/donation-campaigns/:id/full` | A | admin detail | integer id | global |
| POST/PATCH/DELETE | `/api/v1/admin/money/donation-campaigns/:id/tiers[/:tierId]` | A | tier must belong to campaign | strict tier schema | global |
| POST/PATCH | `/api/v1/admin/money/donation-campaigns/:id/items[/:itemId]` | A | item belongs to campaign | strict item schema | global |
| POST/PATCH | `/api/v1/admin/money/donation-campaigns/:id/places[/:placeId]` | A | sum of planned quantities ≤ target | strict place schema | global |
| POST | `/api/v1/admin/money/donation-campaigns/:id/updates` | A | campaign update | strict update schema | global |
| GET | `/api/v1/admin/money/donations` | A | all donations | filters/page | global |
| POST | `/api/v1/admin/money/donations/manual` | A | source cash/bank; audit | strict manual schema | global |
| POST | `/api/v1/admin/money/donations/:id/refund` | A | paid donation only; Stripe refund if applicable; progress recomputed | integer id | global |
| GET | `/api/v1/admin/money/donations/export.csv` | A | CSV injection escaping | filters | global |
| GET | `/api/v1/admin/security-events` | A | security log | severity/type/user/date/page | global |
| GET | `/api/v1/admin/security-events/summary` | A | last 24h counts | — | global |
| POST | `/api/v1/admin/content/books` | A | publisher/editor role; draft only | strict `bookSchema` | global |
| PATCH | `/api/v1/admin/content/books/:id` | A | no status/isPublished escalation | partial strict `bookSchema` | global |
| POST | `/api/v1/admin/content/books/:id/publish` | A | checklist: Arabic title, ebook PDF, unique slug | integer id | global |
| POST | `/api/v1/admin/content/images` | A | MIME/size/dimensions checked server-side | multipart | global |

All other routes retain their existing authentication/authorization middleware; the route inventory test asserts that every documented operation is mounted and that private operations require a token.

## Tamper tests

Automated (`backend/tests/paymentsOrdersDonations.test.js` and existing suite):

1. Send `price`, `total`, `discount`, `shipping`, `currency` in the checkout/cart body → rejected by strict schemas.
2. Send `units` with a donation amount → rejected.
3. Send quantity `0`, `-1`, decimal, above max, or `2` for an ebook → rejected or normalized to one by the server.
4. Send `status`, `paid`, `userId`, `role` to checkout or fulfilment → rejected/ignored; ownership comes from the token.
5. Tier id from another campaign → 404; amount below min/above max/wrong currency/more than two decimals → 422/400.
6. Campaign ended, draft, not started, or full → 409.
7. Order state machine: paying from `pending_payment` is allowed; `fulfilled` from `pending_payment`, second refund, or backwards fulfilment is refused.
8. Stripe amount/currency mismatch → `amount_mismatch`, no entitlement, SecurityEvent and admin alert.
9. Forged webhook signature → 400 before JSON parsing; replayed event id → idempotent no-op.
10. Download token reused/expired/other account → 403; no entitlement → 403; download limit → 409.
11. Read another reader’s order/download/donation/cart id → 404, never data.
12. Non-admin token on an admin route → 403; no token → 401.
13. Manual donation with a missing/invalid campaign or currency mismatch → 404/422.
14. CSV cells starting with `= + - @` are prefixed to prevent spreadsheet formula injection.

Manual Stripe test-mode checklist:

- Buy one ebook; verify the order appears in admin as `pending_payment` before payment and becomes `fulfilled` after the webhook; download every file and exhaust the quota.
- Buy three ebooks in one cart; verify one order and three entitlements/download buttons.
- Mix an ebook and a printed book; verify shipping appears once, the address is required, and the digital consent is recorded.
- Cancel at Stripe; verify the cart is preserved and the order becomes `canceled`.
- Use a declining card (`4000 0000 0000 0002`); verify `failed` and no entitlement.
- Refresh the success page repeatedly; verify polling is idempotent and no duplicate emails/entitlements.
- Create a 300-book campaign with three distribution places; donate with a tier, a custom amount and monthly; verify units/progress only change after payment.
- Edit the amount or ids in DevTools before submitting; verify 400/422 and a SecurityEvent.