#!/usr/bin/env node
/**
 * pb-setup.js — Idempotent PocketBase collection setup
 *
 * Usage:
 *   node pb-setup.js                     # uses defaults below
 *   PB_URL=https://... PB_EMAIL=... PB_PASS=... node pb-setup.js
 *
 * What it does:
 *  1. Authenticates as superuser
 *  2. For each collection in SCHEMA:
 *     - If it doesn't exist → creates it with all fields + public rules
 *     - If it exists       → patches rules to public (non-destructive)
 */

const PB_URL   = (process.env.PB_URL   || 'https://navic-pocketbase.2e26n3.easypanel.host').replace(/\/+$/, '');
const PB_EMAIL = process.env.PB_EMAIL  || 'admin@marginbites.com';
const PB_PASS  = process.env.PB_PASS   || '';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function superuserLogin() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed ${res.status}: ${body}`);
  }
  const { token } = await res.json();
  console.log('[PB] Authenticated as superuser');
  return token;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function api(token, method, path, body) {
  const res = await fetch(`${PB_URL}/api/${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} /api/${path} → ${res.status}: ${data.message || text}`);
  return data;
}

// ── Field helpers ─────────────────────────────────────────────────────────────

const text    = (name, opts = {}) => ({ name, type: 'text',   required: false, ...opts });
const number  = (name, opts = {}) => ({ name, type: 'number', required: false, ...opts });
const bool    = (name, opts = {}) => ({ name, type: 'bool',   required: false, ...opts });
const dateF   = (name, opts = {}) => ({ name, type: 'date',   required: false, ...opts });
const json    = (name, opts = {}) => ({ name, type: 'json',   required: false, ...opts });
const sel     = (name, values, opts = {}) => ({
  name, type: 'select', required: false,
  options: { maxSelect: 1, values },
  ...opts,
});
const selM    = (name, values, opts = {}) => ({
  name, type: 'select', required: false,
  options: { maxSelect: 10, values },
  ...opts,
});

// Public rules (empty string = authenticated users can access)
const PUBLIC = { listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '' };

// ── Collection schema ─────────────────────────────────────────────────────────

const SCHEMA = [
  {
    name: 'app_settings',
    fields: [
      text('key', { required: true }),
      text('value'),
    ],
  },
  {
    name: 'audit_logs',
    fields: [
      text('actor_user_id'),
      text('actor_email'),
      text('actor_name'),
      text('action_type'),
      text('entity_type'),
      text('entity_id'),
      text('entity_number'),
      text('description'),
      text('location_id'),
    ],
  },
  {
    name: 'food_cost_daily',
    fields: [
      text('location_id'),
      dateF('date'),
      number('theoretical_fc_pct'),
      number('actual_fc_pct'),
      number('gap_pct'),
      number('theoretical_fc_eur'),
      number('actual_fc_eur'),
      number('gap_eur'),
      number('total_sales_eur'),
      number('total_purchases_eur'),
      number('opening_stock_eur'),
      number('closing_stock_eur'),
    ],
  },
  {
    name: 'gap_analysis',
    fields: [
      text('location_id'),
      dateF('date'),
      number('driver_1_pct'),
      number('driver_1_eur'),
      number('driver_2_pct'),
      number('driver_2_eur'),
      number('driver_3_pct'),
      number('driver_3_eur'),
      number('driver_4_pct'),
      number('driver_4_eur'),
      json('top_incidents'),
      json('top_waste_products'),
    ],
  },
  {
    name: 'grns',
    fields: [
      text('grn_number'),
      text('location_id'),
      text('supplier_id'),
      text('supplier_name'),
      dateF('delivery_date'),
      text('albaran_number'),
      text('albaran_file_url'),
      number('total_amount'),
      number('lines_count'),
      sel('status', ['Draft', 'OCR_Processing', 'Pending_Validation', 'Validated', 'Posted', 'Rejected']),
      bool('ocr_processed'),
      number('ocr_confidence'),
      text('ocr_provider'),
      json('ocr_raw_payload'),
      text('validation_notes'),
      text('validated_by_user_id'),
      text('validated_by_name'),
      dateF('validated_at'),
      text('posted_by_user_id'),
      dateF('posted_at'),
    ],
  },
  {
    name: 'grn_incidents',
    fields: [
      text('grn_id'),
      text('grn_number'),
      text('grn_line_id'),
      text('product_id'),
      text('product_name'),
      text('location_id'),
      sel('incident_type', ['price_mismatch', 'qty_short', 'damaged', 'wrong_product', 'missing_item', 'extra_item', 'other']),
      sel('severity', ['low', 'medium', 'high', 'critical']),
      text('description'),
      number('impact_eur'),
      bool('is_resolved'),
      text('resolution_notes'),
    ],
  },
  {
    name: 'grn_lines',
    fields: [
      text('grn_id'),
      text('grn_number'),
      text('product_id'),
      text('product_name'),
      text('product_sku'),
      text('raw_description'),
      number('quantity'),
      text('unit_code'),
      number('unit_price'),
      number('line_total'),
      number('ocr_confidence'),
      number('matched_confidence'),
      bool('is_flagged'),
      text('flag_reason'),
      number('price_variance_pct'),
    ],
  },
  {
    name: 'integration_sync_states',
    fields: [
      text('integration_name'),
      text('location_id'),
      sel('status', ['idle', 'syncing', 'success', 'error']),
      dateF('last_sync_at'),
      text('last_error'),
      number('records_synced'),
      json('meta'),
    ],
  },
  {
    name: 'inventories',
    fields: [
      text('inventory_number'),
      text('location_id'),
      sel('inventory_type', ['full', 'express', 'anomaly_triggered']),
      sel('count_scope', ['all_products', 'key_products', 'custom_list']),
      sel('status', ['Draft', 'In_Progress', 'Submitted', 'Reviewed', 'Posted', 'Closed', 'Cancelled']),
      bool('auto_post_corrections'),
      dateF('started_at'),
      dateF('completed_at'),
      dateF('posted_at'),
      number('lines_count'),
      number('lines_counted'),
      number('lines_flagged'),
      number('total_variance_value'),
      json('anomaly_reasons'),
      text('started_by_user_id'),
      text('started_by_name'),
      text('reviewed_by_user_id'),
      text('reviewed_by_name'),
    ],
  },
  {
    name: 'inventory_lines',
    fields: [
      text('inventory_id'),
      text('inventory_number'),
      text('product_id'),
      text('product_name'),
      text('product_sku'),
      text('product_category'),
      text('base_unit_code'),
      number('qty_theoretical_base'),
      number('qty_counted_base'),
      number('variance_qty_base'),
      number('variance_pct'),
      number('variance_value_eur'),
      number('avg_cost_snapshot'),
      bool('is_flagged'),
      text('flag_reason'),
      sel('line_status', ['Pending', 'Counted', 'Confirmed']),
      text('counted_by_user_id'),
      text('counted_by_name'),
      dateF('counted_at'),
    ],
  },
  {
    name: 'ledger_movements',
    fields: [
      text('movement_number'),
      dateF('movement_date'),
      text('location_id'),
      text('product_id'),
      text('product_name'),
      text('product_sku'),
      sel('movement_type', ['GRN_IN', 'CONSUMPTION_OUT', 'WASTE_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'INVENTORY_CORRECTION']),
      number('quantity'),
      text('unit_code'),
      number('quantity_base'),
      text('base_unit_code'),
      number('unit_cost'),
      number('total_cost'),
      text('reference_type'),
      text('reference_id'),
      text('reference_number'),
      text('notes'),
      text('actor_user_id'),
      text('actor_name'),
    ],
  },
  {
    name: 'locations',
    fields: [
      text('name', { required: true }),
      text('address'),
      text('city'),
      text('phone'),
      text('email'),
      text('timezone'),
      bool('is_active'),
      json('settings'),
      text('tspoonlab_order_center_id'),
    ],
  },
  {
    name: 'notifications',
    fields: [
      text('title'),
      text('message'),
      sel('priority', ['critical', 'high', 'medium', 'low']),
      sel('status', ['Pending', 'Read']),
      text('location_id'),
      text('related_entity_type'),
      text('related_entity_id'),
      dateF('read_at'),
    ],
  },
  {
    name: 'po_lines',
    fields: [
      text('purchase_order_id'),
      text('po_number'),
      text('product_id'),
      text('product_name'),
      text('product_sku'),
      text('unit_code'),
      number('ordered_qty'),
      number('received_qty'),
      number('unit_price_estimated'),
      number('unit_price_actual'),
      number('line_total_estimated'),
      number('line_total_actual'),
      sel('line_status', ['Open', 'Partial', 'Received', 'Cancelled']),
      text('suggestion_reason'),
    ],
  },
  {
    name: 'products',
    fields: [
      text('product_name', { required: true }),
      text('sku'),
      text('category'),
      text('base_unit_code'),
      text('purchase_unit_code'),
      number('purchase_to_base_ratio'),
      bool('is_active'),
      bool('is_key_product'),
      number('avg_price'),
      number('min_stock'),
      number('max_stock'),
      number('reorder_point'),
      text('default_supplier_id'),
      text('storage_area_id'),
      text('tspoonlab_ingredient_id'),
      text('barcode'),
    ],
  },
  {
    name: 'purchase_orders',
    fields: [
      text('po_number'),
      text('location_id'),
      text('supplier_id'),
      text('supplier_name'),
      dateF('order_date'),
      dateF('requested_delivery_date'),
      sel('status', ['Draft', 'Suggested', 'Sent', 'Partially_Received', 'Received', 'Cancelled']),
      sel('source', ['manual', 'voice', 'ai_suggested']),
      text('notes'),
      number('total_estimated_amount'),
      number('total_actual_amount'),
      number('lines_count'),
      sel('sent_via', ['email', 'whatsapp', 'phone', 'other']),
      dateF('sent_at'),
      text('sent_by_user_id'),
      dateF('received_at'),
    ],
  },
  {
    name: 'recipes',
    fields: [
      text('recipe_name', { required: true }),
      text('location_id'),
      text('base_unit_code'),
      sel('recipe_type', ['intermediate', 'final']),
      number('yield_pct'),
      number('total_cost'),
      number('cost_per_unit'),
      text('process_notes'),
      text('tspoonlab_recipe_id'),
      bool('is_active'),
    ],
  },
  {
    name: 'recipe_lines',
    fields: [
      text('recipe_id'),
      text('product_id'),
      text('product_name'),
      text('product_sku'),
      number('quantity'),
      text('unit_code'),
      number('quantity_base'),
      bool('is_fixed_qty'),
    ],
  },
  {
    name: 'recommendations',
    fields: [
      text('location_id'),
      dateF('date'),
      text('title'),
      text('text'),
      sel('priority', ['High', 'Medium', 'Low']),
      sel('status', ['Open', 'Dismissed', 'Done']),
      number('estimated_impact_eur'),
      sel('related_driver', ['driver_1', 'driver_2', 'driver_3', 'driver_4']),
      sel('action_type', ['review_prices', 'check_reception', 'review_waste', 'check_recipes', 'stock_control', 'supplier_negotiation', 'training', 'other']),
    ],
  },
  {
    name: 'sales_daily',
    fields: [
      text('location_id'),
      dateF('date'),
      text('sales_item_id'),
      text('sales_item_name'),
      number('quantity_sold'),
      number('revenue_eur'),
      number('avg_selling_price'),
      text('source'),
    ],
  },
  {
    name: 'sales_items',
    fields: [
      text('location_id'),
      text('name', { required: true }),
      text('recipe_id'),
      text('recipe_name'),
      number('selling_price'),
      bool('is_active'),
      text('tspoonlab_dish_id'),
    ],
  },
  {
    name: 'stock_on_hand',
    fields: [
      text('location_id', { required: true }),
      text('product_id', { required: true }),
      text('product_name'),
      text('product_sku'),
      text('product_category'),
      text('base_unit_code'),
      number('quantity_base'),
      number('avg_cost'),
      number('total_value'),
      bool('needs_reorder'),
      bool('is_negative'),
      number('avg_daily_consumption'),
      number('days_coverage'),
      dateF('last_movement_date'),
    ],
  },
  {
    name: 'storage_areas',
    fields: [
      text('location_id'),
      text('name'),
      sel('type', ['refrigerator', 'freezer', 'dry', 'cellar', 'other']),
      text('description'),
      bool('is_active'),
    ],
  },
  {
    name: 'suppliers',
    fields: [
      text('supplier_code'),
      text('name', { required: true }),
      text('email'),
      text('phone'),
      sel('preferred_order_channel', ['email', 'whatsapp', 'phone', 'other']),
      bool('is_active'),
      text('tax_id'),
      text('address'),
      text('city'),
      text('payment_terms'),
      text('whatsapp_number'),
      json('matching_aliases'),
    ],
  },
  {
    name: 'system_errors',
    fields: [
      text('error_type'),
      text('message'),
      text('stack'),
      sel('status', ['Open', 'Resolved', 'Ignored']),
      text('page'),
      text('location_id'),
      text('user_id'),
      json('context'),
    ],
  },
  {
    name: 'theoretical_consumptions',
    fields: [
      text('location_id'),
      dateF('date'),
      text('product_id'),
      text('product_name'),
      text('product_sku'),
      number('quantity_consumed'),
      text('base_unit_code'),
      number('cost_per_unit'),
      number('total_cost'),
      text('recipe_id'),
      text('recipe_name'),
      text('sales_item_id'),
      text('sales_item_name'),
      number('sales_quantity'),
    ],
  },
  {
    name: 'units',
    fields: [
      text('code', { required: true }),
      text('name'),
      sel('type', ['weight', 'volume', 'unit', 'length', 'other']),
      number('base_conversion'),
      text('base_unit_code'),
    ],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!PB_PASS) {
    console.error('ERROR: Set PB_PASS env var with your superuser password');
    process.exit(1);
  }

  const token = await superuserLogin();

  // Fetch existing collections
  const { items: existing } = await api(token, 'GET', 'collections?perPage=200');
  const existingByName = {};
  existing.forEach(c => { existingByName[c.name] = c; });
  console.log(`[PB] Found ${existing.length} existing collections`);

  let created = 0;
  let patched = 0;

  for (const def of SCHEMA) {
    const existing = existingByName[def.name];

    if (!existing) {
      // Create new collection
      await api(token, 'POST', 'collections', {
        name: def.name,
        type: 'base',
        fields: def.fields,
        ...PUBLIC,
      });
      console.log(`  [+] Created: ${def.name}`);
      created++;
    } else {
      // Only patch rules (non-destructive: don't touch existing fields)
      await api(token, 'PATCH', `collections/${existing.id}`, PUBLIC);
      console.log(`  [~] Rules patched: ${def.name}`);
      patched++;
    }
  }

  console.log(`\n[PB] Done. Created: ${created}  Patched: ${patched}`);
}

main().catch(err => {
  console.error('[PB] FATAL:', err.message);
  process.exit(1);
});
