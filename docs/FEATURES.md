# Marginbites — Feature Inventory

## Pages & Routes

| Route | Page | Roles | Description |
|-------|------|-------|-------------|
| `/login` | Login.jsx | Public | Login + Register |
| `/dashboard` | Dashboard.jsx | All | KPI summary |
| `/purchase-orders` | PurchaseOrders.jsx | All | PO list + voice AI + auto-suggest |
| `/po-new` | PONew.jsx | All | Manual PO creation |
| `/po-detail` | PODetail.jsx | All | PO view |
| `/grn-list` | GRNList.jsx | All | GRN list + OCR upload |
| `/grn-detail` | GRNDetail.jsx | All | GRN validation + post to stock |
| `/stock` | Stock.jsx | All | Stock levels + manual movements |
| `/inventories` | Inventories.jsx | encargado+ | Inventory cycles |
| `/inventory-detail` | InventoryDetail.jsx | encargado+ | Count lines + variance |
| `/bleed-panel` | BleedPanel.jsx | manager+ | Food cost gap + AI recommendations |
| `/sales-recipes` | SalesRecipes.jsx | encargado+ | Recipe-sales mapping + consumption |
| `/alerts` | Alerts.jsx | All | Notifications + system errors |
| `/settings` | Settings.jsx | manager+ | Locations, suppliers, products, thresholds |
| `/monitoring` | Monitoring.jsx | admin | System errors, audit logs, sync states |

---

## Feature Details by Page

### Dashboard
**Purpose**: At-a-glance KPIs for the selected location.
**Data loaded**:
- Yesterday's FoodCostDaily: theoretical FC%, actual FC%, gap%
- StockOnHand for location
- GRN count with `status = 'Pending_Validation'`
- Inventory in progress (`status = 'In_Progress'`)
- Top recommendations (`status = 'Open'`, sort `-estimated_impact_eur`, limit 5)

---

### PurchaseOrders
**Purpose**: Manage orders to suppliers.

**Workflows**:

#### Manual Order (PONew)
1. Select supplier
2. Add lines (product + qty + price)
3. Save as Draft
4. Send (updates status to 'Sent', records `sent_via`, `sent_at`)

**PO number format**: `PO-YYYY-NNNN` (sequential within year)

**PO statuses**: `Draft → Suggested → Sent → Partially_Received → Received → Cancelled`

#### Voice Order (AI)
1. Record audio (MediaRecorder API, WebM)
2. Send to OpenAI Whisper → Spanish transcription
3. Send to GPT-4o-mini with supplier list + product list
4. Parsed JSON: `{ supplier_id, supplier_name, notes, lines: [{ product_id, product_name, quantity, unit, unit_price }] }`
5. User confirms → `PurchaseOrder.create()` + `POLine.create()` per line

#### AI Auto-Suggestions
1. Fetch stock with `needs_reorder = true`
2. Group by supplier
3. GPT-4o-mini: given current stock + avg daily consumption → suggest qty for 7-day coverage
4. Formula: `MAX(1, ceil((avg_daily × 7) - current_stock))`
5. One PO per supplier created as `status: 'Suggested'`

---

### GRNList / GRNDetail
**Purpose**: Receive supplier deliveries, validate, and post to stock.

**GRN statuses**: `Draft → OCR_Processing → Pending_Validation → Validated → Posted → Rejected`

#### OCR Workflow (GRNList)
1. Upload delivery note image
2. Convert to base64
3. GPT-4o-mini Vision → extract: supplier_name, delivery_date, albaran_number, lines, total_amount, confidence (0-1)
4. Match supplier by name (exact then fuzzy)
5. Match products by name (exact then fuzzy)
6. Create GRN + GRNLines with `ocr_confidence`, `matched_confidence`, `is_flagged` (if price variance > threshold)

#### Validation (GRNDetail)
- Review each GRN line
- Edit quantities / prices
- Flag incidents: `price_mismatch | qty_short | damaged | wrong_product | missing_item | extra_item | other`
- Incident severity: low / medium / high / critical
- Validate: updates GRN status to 'Validated'

#### Post to Stock (GRNDetail)
For each GRN line:
1. Create `LedgerMovement { type: 'GRN_IN', quantity_base, unit_cost, total_cost, movement_date }`
2. Upsert `StockOnHand`:
   - New qty = old_qty + in_qty
   - Weighted avg cost = (old_qty × old_cost + in_qty × in_cost) / new_qty
3. Update GRN status to 'Posted'
4. Create AuditLog entry

---

### Stock
**Purpose**: View current stock + manual stock adjustments.

**Movement types**: `GRN_IN | CONSUMPTION_OUT | WASTE_OUT | TRANSFER_IN | TRANSFER_OUT | ADJUSTMENT_IN | ADJUSTMENT_OUT | INVENTORY_CORRECTION`

**Manual adjustment flow**:
1. Select product
2. Enter quantity + movement type + reason
3. Create `LedgerMovement`
4. Update `StockOnHand` (qty + recalculate avg cost)
5. Create `AuditLog`

---

### Inventories / InventoryDetail
**Purpose**: Physical stock count cycles with variance detection.

**Inventory types**: `full | express | anomaly_triggered`

**Count scopes**: `all_products | key_products`

**Inventory statuses**: `Draft → In_Progress → Submitted → Reviewed → Posted → Closed | Cancelled`

#### Create Inventory
- Full: creates InventoryLine for every active product
- Express (from anomalies): creates InventoryLine only for products with negative/suspicious stock

#### Count Flow (InventoryDetail)
1. Enter counted quantity per line
2. System calculates: `variance_qty = counted - theoretical`, `variance_pct`, `variance_value_eur`
3. Lines with `variance_pct > 15%` are flagged (`is_flagged = true`)
4. Submit: locks inventory for review

#### Post Inventory
For each flagged line:
1. Create `LedgerMovement { type: 'INVENTORY_CORRECTION' }`
2. Update `StockOnHand` to counted quantity
3. Create `AuditLog`

---

### BleedPanel (Food Cost Gap Analysis)
**Purpose**: Daily food cost gap analysis with AI recommendations.

**Metrics computed**:
- Theoretical FC% = (Σ recipe_cost × qty_sold) / total_sales × 100
- Actual FC% = (total_purchases_posted - opening_stock + closing_stock) / total_sales × 100
- Gap = Actual FC% - Theoretical FC%

**Gap drivers** (hardcoded weights):
| Driver | Weight | Description |
|--------|--------|-------------|
| driver_1 | 40% | Purchase price variance |
| driver_2 | 20% | Reception incidents |
| driver_3 | 25% | Production/yield waste |
| driver_4 | 15% | Service waste |

#### AI Recommendations
Triggered when gap > 2%.
Input to GPT-4o-mini:
- Date, sales €, theoretical FC (% + €), actual FC (% + €), gap (% + €)
- Driver breakdown (% + € each)
- Top 3 incidents (type, severity, impact €)
- Top 3 waste products (name, qty, value)

Output: 3-5 recommendations with:
- title (max 60 chars)
- text (2-3 actionable sentences, Spanish)
- priority: High | Medium | Low
- estimated_impact_eur
- related_driver: driver_1/2/3/4
- action_type: review_prices | check_reception | review_waste | check_recipes | stock_control | supplier_negotiation | training | other

Stored in `recommendations` collection, deleted + regenerated each time.

---

### SalesRecipes
**Purpose**: Map menu items to recipes; compute theoretical consumption.

**Workflows**:
1. View SalesItems and their linked recipes
2. Map/re-map: `SalesItem.update({ recipe_id, recipe_name })`
3. Recalculate consumption: for each SalesDaily entry × matched RecipeLine quantities → TheoreticalConsumption records

---

### Settings
**Purpose**: Master data management and threshold configuration.

**Tabs**:
- General: configurable thresholds (stored as JSON in `Location.settings`)
- Suppliers: CRUD
- Products: read-only list (first 50, sort by -created_date)

**Thresholds (Location.settings)**:
```json
{
  "reorder_days_threshold": 3,
  "target_coverage_days": 7,
  "ocr_confidence_warning": 0.80,
  "inventory_variance_flag_pct": 0.15,
  "gap_warning_pct": 0.02,
  "gap_critical_pct": 0.05,
  "auto_post_inventory": false
}
```

**Supplier fields**: `supplier_code, name, email, phone, preferred_order_channel (email|whatsapp), is_active, tax_id, address, payment_terms, whatsapp_number, matching_aliases`

---

### Alerts
**Purpose**: View and manage system notifications.

**Notification fields**: `title, message, priority (critical|high|medium|low), status (Pending|Read), location_id, created`

**Actions**:
- Filter by status (All / Pending / Read)
- Mark as read: `Notification.update({ status: 'Read', read_at: now })`

**System Errors** (tab): filtered `status = 'Open'`, last 20

---

### Monitoring (Admin only)
**Purpose**: System health and audit.

**Tabs**:
- System Errors: last 20, sort `-created_date`
- Audit Log: last 50 user actions, sort `-created_date`
- Integrations: IntegrationSyncState, sort `-updated_at`
- Active GRNs: today's GRNs
- Recent Inventories: last 10, sort `-started_at`

---

## AI Module Summary

| Function | Model | Used In | Input | Output |
|----------|-------|---------|-------|--------|
| `transcribeAudio(blob)` | whisper-1 | PurchaseOrders | Audio WebM | Spanish text |
| `extractPOFromTranscription(text, suppliers, products)` | gpt-4o-mini | PurchaseOrders | Transcription + master data | JSON: supplier_id + lines |
| `extractGRNFromImage(base64, mimeType)` | gpt-4o-mini vision | GRNList | Delivery note image | JSON: supplier + lines + confidence |
| `generateAIRecommendations(metricsContext)` | gpt-4o-mini | BleedPanel | FC metrics + drivers | JSON: 3-5 recommendations |
| `calculateSmartOrderQty(items, targetDays)` | gpt-4o-mini | PurchaseOrders | Stock + consumption | JSON: qty per product |

---

## Role Permissions

| Feature | chef | encargado | manager | admin |
|---------|------|-----------|---------|-------|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Purchase Orders | ✓ | ✓ | ✓ | ✓ |
| GRN | ✓ | ✓ | ✓ | ✓ |
| Stock | ✓ | ✓ | ✓ | ✓ |
| Alerts | ✓ | ✓ | ✓ | ✓ |
| Ventas & Recetas | — | ✓ | ✓ | ✓ |
| Inventarios | — | ✓ | ✓ | ✓ |
| Panel Sangrado | — | — | ✓ | ✓ |
| Configuración | — | — | ✓ | ✓ |
| Monitorización | — | — | — | ✓ |
