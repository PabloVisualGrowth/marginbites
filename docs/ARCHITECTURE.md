# Marginbites — Architecture Reference

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 6 + React Router DOM 6 |
| State / Queries | TanStack React Query 5 |
| UI | Shadcn/ui (Radix UI) + Tailwind CSS 3 |
| Charts | Recharts 2 |
| Forms | React Hook Form 7 + Zod 3 |
| Animations | Framer Motion 11 |
| Backend | PocketBase 0.23.x (self-hosted) |
| AI | OpenAI API (whisper-1, gpt-4o-mini) |
| Deployment | EasyPanel → Docker (nginx:alpine) |

---

## File Tree (src/)

```
src/
├── api/
│   ├── marginbitesClient.js    PocketBase client + entityApi wrapper (27 collections)
│   └── openaiClient.js         OpenAI calls: transcribeAudio, extractPO, extractGRN, generateRecommendations, calculateSmartOrder
├── components/
│   ├── UserNotRegisteredError.jsx
│   └── ui/                     42 Shadcn components (accordion, badge, button, card, dialog, table, toast …)
├── hooks/
│   └── use-mobile.jsx
├── lib/
│   ├── app-params.js           Env vars + URL params + localStorage helpers
│   ├── AuthContext.jsx         Auth state (PocketBase authStore listener)
│   ├── NavigationTracker.jsx   Route-change tracking (calls appLogs stub)
│   ├── PageNotFound.jsx        404 page
│   ├── query-client.js         TanStack QueryClient config
│   └── utils.js                cn() tailwind merge, isIframe flag
├── pages/                      (see FEATURES.md for per-page details)
│   ├── Alerts.jsx
│   ├── BleedPanel.jsx
│   ├── Dashboard.jsx
│   ├── GRNDetail.jsx
│   ├── GRNList.jsx
│   ├── InventoryDetail.jsx
│   ├── Inventories.jsx
│   ├── Login.jsx
│   ├── Monitoring.jsx
│   ├── PODetail.jsx
│   ├── PONew.jsx
│   ├── PurchaseOrders.jsx
│   ├── SalesRecipes.jsx
│   ├── Settings.jsx
│   ├── Stock.jsx
│   └── pages.config.js
├── utils/
│   └── index.ts                createPageUrl(pageName) → URL path
├── App.jsx                     Router: /login (public), /* → AuthenticatedApp
├── Layout.jsx                  Sidebar + topbar shell; loads locations + notifications globally
└── main.jsx                    React root + QueryClientProvider + AuthProvider
```

---

## PocketBase Collections (27)

| Entity Key | Collection Name | Purpose |
|-----------|----------------|---------|
| AppSetting | app_settings | App-level config |
| AuditLog | audit_logs | User action audit trail |
| FoodCostDaily | food_cost_daily | Daily FC metrics (theoretical vs actual) |
| GapAnalysis | gap_analysis | Driver breakdown (prices/incidents/waste/service) |
| GRN | grns | Goods Receipt Notes |
| GRNIncident | grn_incidents | Delivery incidents with impact € |
| GRNLine | grn_lines | GRN line items |
| IntegrationSyncState | integration_sync_states | External sync status |
| Inventory | inventories | Physical count cycles |
| InventoryLine | inventory_lines | Per-product counted lines |
| LedgerMovement | ledger_movements | Stock movement journal |
| Location | locations | Restaurant/cost-centre locations |
| Notification | notifications | System alerts |
| POLine | po_lines | Purchase order lines |
| Product | products | Product master (SKU, unit, avg_price, is_key_product) |
| PurchaseOrder | purchase_orders | Purchase orders (Draft→Sent→Received) |
| Recipe | recipes | Recipe definitions |
| RecipeLine | recipe_lines | Recipe ingredients |
| Recommendation | recommendations | AI-generated action recommendations |
| SalesDaily | sales_daily | Daily sales by item |
| SalesItem | sales_items | Menu items linked to recipes |
| StockOnHand | stock_on_hand | Current stock (qty + weighted avg cost) |
| StorageArea | storage_areas | Physical storage zones |
| Supplier | suppliers | Supplier master data |
| SystemError | system_errors | Application errors log |
| TheoreticalConsumption | theoretical_consumptions | Expected consumption from sales × recipe |
| Unit | units | Unit definitions |

### PocketBase Rules (as configured)
All 27 collections: `listRule = "" , viewRule = "", createRule = "", updateRule = "", deleteRule = ""`
(Empty string = public access. `null` = superuser-only — the original bug.)

### Users Collection (built-in)
- Fields used by UI: `email`, `full_name`, `role` (admin / manager / chef / encargado), `preferences.default_location_id`
- Auth: `pb.collection('users').authWithPassword(email, password)`
- Register: `pb.collection('users').create({ name, email, password, passwordConfirm })`
- Role is injected as `'admin'` fallback in `auth.me()` until a real `role` field is added to the users schema

---

## API Layer (marginbitesClient.js)

### env resolution
```js
const getEnv = (key) =>
  window.__ENV__?.[key] || import.meta.env[key] || '';

const pb = new PocketBase(getEnv('VITE_POCKETBASE_URL') || 'http://localhost:8090');
pb.autoCancellation(false);
```

### entityApi methods
```js
entityApi(collectionName) → {
  list(sort?, limit?)           // pb.send GET, returns items[]
  filter(filters?, opts?)       // pb.send GET with filter string, returns items[]
  get(id)                       // pb.collection.getOne — returns null if id falsy
  create(data)
  update(id, data)              // rejects if id falsy
  delete(id)                    // rejects if id falsy
}
```

### Filter builder (toFilter)
```js
{ location_id: 'abc', is_active: true }
  → "location_id = 'abc' && is_active = true"
```
Rule: only includes key if value !== null && !== undefined.
Filter param is never sent to PocketBase if the resulting string is empty.

---

## Auth Flow

1. `Login.jsx` → `pb.collection('users').authWithPassword()` → token stored in `pb.authStore` (localStorage)
2. `AuthContext.jsx` listens to `pb.authStore.onChange` → updates React state
3. `App.jsx`: unauthenticated → redirect to `/login`
4. `Layout.jsx`: `marginbites.auth.me()` → injects `role: 'admin'` fallback
5. Logout: `pb.authStore.clear()` + redirect to `/login`

---

## Deployment Architecture

```
GitHub (PabloVisualGrowth/marginbites)
    │ push to main
    ▼
EasyPanel (auto-build on push)
    │
    ├── Service: marginbites (frontend)
    │   ├── Dockerfile: node:20-alpine → npm run build → nginx:alpine
    │   ├── docker-entrypoint.sh → generates /usr/share/nginx/html/env-config.js
    │   │     window.__ENV__ = { VITE_POCKETBASE_URL, VITE_OPENAI_API_KEY, ... }
    │   ├── nginx.conf: SPA routing (try_files → index.html)
    │   │               assets cached 1y immutable (content-hashed by Vite)
    │   │               index.html NOT cached aggressively
    │   └── Port 80 → EasyPanel reverse proxy (HTTPS)
    │
    └── Service: pocketbase (backend)
        ├── Container: ghcr.io/muchobien/pocketbase or similar
        ├── Port 8090
        ├── Persistent volume: /pb_data
        └── Admin UI: /api/collections/_superusers
```

### Runtime env injection
`index.html` loads `/env-config.js` (synchronous, non-module) **before** the Vite bundle.
This ensures `window.__ENV__` is available when `marginbitesClient.js` initialises.

---

## Known Bugs (as of last commit)

### Critical
| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | Layout.jsx:48 | `Notification.filter({ status: 'Pending' })` — `status` field doesn't exist in PocketBase notifications collection → 400 "Invalid filter" on EVERY page (Layout is global) | Changed to `Notification.list()` ✓ |
| 2 | marginbitesClient.js | SDK v0.21 `getFullList` serialised `filter=` (empty string) even when no filter → PocketBase 400 | Replaced with `pb.send()` using explicit query object ✓ |
| 3 | Settings.jsx:58 | `Supplier.list()` called before `list()` method existed in entityApi → silent TypeError | Added `list()` method ✓ |
| 4 | Multiple pages | `filter=undefined` in URLs → PocketBase 400 | Fixed in `filter()` method ✓ |
| 5 | Multiple pages | `.get(null)` calls → 404 on `/records/null` | Guard in `get()` ✓ |

### Open
| # | File | Bug |
|---|------|-----|
| 6 | GRNDetail.jsx | Weighted avg cost breaks if stock goes negative before posting |
| 7 | BleedPanel.jsx | Driver split hardcoded 40/20/25/15%; not configurable |
| 8 | openaiClient.js | API key exposed in browser (VITE_ prefix → client bundle) |
| 9 | SalesRecipes.jsx:118 | Linear consumption scaling ignores fixed-qty recipe components |
| 10 | Multiple | N+1 query pattern (multiple sequential filter() calls per page) |
| 11 | All pages | No server-side pagination — all records fetched at once (perPage 100-500) |
| 12 | PurchaseOrders.jsx | No duplicate PO check for same supplier+date |
