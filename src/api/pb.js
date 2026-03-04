/**
 * PocketBase API layer
 *
 * Rules:
 *  - NEVER include `filter` in a request unless it is a non-empty, trimmed string.
 *  - NEVER include `sort` with a field that doesn't exist in the collection (callers
 *    should pass known fields; use '-created' as safe default).
 *  - All list operations use raw fetch so the PocketBase JS SDK cannot accidentally
 *    serialise undefined / null / empty-string query params.
 *  - CRUD (create / update / delete / getOne) uses the SDK — it handles FormData,
 *    file uploads and auth headers correctly for those operations.
 */

import PocketBase from 'pocketbase';

// ── Environment resolution ────────────────────────────────────────────────────
const getEnv = (key) =>
  (typeof window !== 'undefined' && window.__ENV__?.[key]) ||
  import.meta.env[key] ||
  '';

const BASE_URL = (getEnv('VITE_POCKETBASE_URL') || 'http://localhost:8090').replace(/\/+$/, '');

console.log('[PB] baseURL =', BASE_URL);

// ── PocketBase SDK instance (used for auth + CRUD mutations) ──────────────────
export const pb = new PocketBase(BASE_URL);
pb.autoCancellation(false);

// ── Low-level list fetcher ────────────────────────────────────────────────────
/**
 * Fetch a paginated list from a PocketBase collection.
 * Only adds query params that have real values — filter is NEVER sent if empty.
 *
 * @param {string} collection   Collection name
 * @param {object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.perPage=100]
 * @param {string} [opts.sort='-created']
 * @param {string} [opts.filter]         Only sent if non-empty string
 * @param {string} [opts.expand]
 * @param {string} [opts.fields]
 * @returns {Promise<{items: any[], totalItems: number, totalPages: number}>}
 */
async function pbList(collection, opts = {}) {
  const url = new URL(`${BASE_URL}/api/collections/${encodeURIComponent(collection)}/records`);

  url.searchParams.set('page',    String(opts.page    ?? 1));
  url.searchParams.set('perPage', String(opts.perPage ?? 100));
  url.searchParams.set('sort',    opts.sort ?? '-created');

  // Only add filter if it is a non-empty trimmed string
  const filter = typeof opts.filter === 'string' ? opts.filter.trim() : '';
  if (filter) url.searchParams.set('filter', filter);

  if (opts.expand) url.searchParams.set('expand', opts.expand);
  if (opts.fields)  url.searchParams.set('fields',  opts.fields);

  const headers = { 'Accept': 'application/json' };
  if (pb.authStore.isValid && pb.authStore.token) {
    headers['Authorization'] = `Bearer ${pb.authStore.token}`;
  }

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch {}
    const msg = body?.message || res.statusText;
    console.error(`[PB] list(${collection}) ${res.status}:`, msg, '| URL:', url.toString());
    throw Object.assign(new Error(`PocketBase ${res.status}: ${msg}`), { status: res.status, data: body });
  }

  const data = await res.json();
  console.log(`[PB] list(${collection}) → ${data.items?.length ?? 0} / ${data.totalItems} items`);
  return data;
}

// ── toFilter helper ───────────────────────────────────────────────────────────
/**
 * Convert a plain object to a PocketBase filter string.
 * Skips keys whose value is null / undefined.
 * Example: { location_id: 'abc', is_active: true } → "location_id = 'abc' && is_active = true"
 */
export function toFilter(filters = {}) {
  return Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      if (typeof v === 'boolean') return `${k} = ${v}`;
      if (typeof v === 'number')  return `${k} = ${v}`;
      return `${k} = '${String(v).replace(/'/g, "\\'")}'`;
    })
    .join(' && ');
}

// ── entityApi factory ─────────────────────────────────────────────────────────
/**
 * Returns a CRUD + list API for a given PocketBase collection.
 *
 * @param {string} collectionName
 */
function entityApi(collectionName) {
  return {
    /**
     * Fetch records with an optional filter object.
     * @param {object} [filters={}]     Plain object → converted to PB filter string
     * @param {object} [opts={}]        { sort, perPage, page, expand, fields }
     */
    filter: async (filters = {}, opts = {}) => {
      const filterStr = toFilter(filters);
      const result = await pbList(collectionName, {
        page:    opts.page    ?? 1,
        perPage: opts.perPage ?? 100,
        sort:    opts.sort    ?? '-created',
        filter:  filterStr || undefined,   // undefined → not sent
        expand:  opts.expand,
        fields:  opts.fields,
      });
      return result.items ?? [];
    },

    /**
     * Fetch all records (convenience — no filter, custom sort/limit).
     * @param {string} [sort='-created']
     * @param {number} [limit=100]
     */
    list: async (sort, limit) => {
      const result = await pbList(collectionName, {
        page:    1,
        perPage: limit ?? 100,
        sort:    sort  ?? '-created',
      });
      return result.items ?? [];
    },

    /**
     * Fetch a paginated page (returns full PB response with totalItems).
     */
    getPage: (page, perPage, opts = {}) => {
      const filterStr = toFilter(opts.filters ?? {});
      return pbList(collectionName, {
        page,
        perPage,
        sort:   opts.sort ?? '-created',
        filter: filterStr || undefined,
        expand: opts.expand,
        fields: opts.fields,
      });
    },

    /** Get a single record by ID. Returns null if id is falsy. */
    get: (id) => {
      if (!id) return Promise.resolve(null);
      return pb.collection(collectionName).getOne(id)
        .catch(err => {
          console.error(`[PB] get(${collectionName}, ${id}) ERROR:`, err?.status, err?.message);
          throw err;
        });
    },

    /** Create a record. */
    create: (data) =>
      pb.collection(collectionName).create(data)
        .catch(err => {
          console.error(`[PB] create(${collectionName}) ERROR:`, err?.status, err?.message, err?.data);
          throw err;
        }),

    /** Update a record. Rejects immediately if id is falsy. */
    update: (id, data) => {
      if (!id) return Promise.reject(new Error(`[PB] update(${collectionName}): id is required`));
      return pb.collection(collectionName).update(id, data)
        .catch(err => {
          console.error(`[PB] update(${collectionName}, ${id}) ERROR:`, err?.status, err?.message, err?.data);
          throw err;
        });
    },

    /** Delete a record. Rejects immediately if id is falsy. */
    delete: (id) => {
      if (!id) return Promise.reject(new Error(`[PB] delete(${collectionName}): id is required`));
      return pb.collection(collectionName).delete(id)
        .catch(err => {
          console.error(`[PB] delete(${collectionName}, ${id}) ERROR:`, err?.status, err?.message);
          throw err;
        });
    },
  };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
export const auth = {
  /** Returns the current user with role fallback. */
  me: () => {
    if (!pb.authStore.isValid) return Promise.reject(new Error('Not authenticated'));
    const model = pb.authStore.model ?? {};
    return Promise.resolve({ ...model, role: model.role || 'admin' });
  },

  /** Register a new user. */
  register: (name, email, password) =>
    pb.collection('users').create({
      name,
      email,
      password,
      passwordConfirm: password,
    }),

  /** Login with email + password. */
  login: (email, password) =>
    pb.collection('users').authWithPassword(email, password),

  /** Logout and redirect. */
  logout: () => {
    pb.authStore.clear();
    window.location.href = '/login';
  },

  redirectToLogin: () => { window.location.href = '/login'; },
};

// ── Stubs (legacy compatibility) ──────────────────────────────────────────────
export const appLogs = {
  logUserInApp: () => Promise.resolve(),
};

// ── Entity registry ───────────────────────────────────────────────────────────
export const entities = {
  AppSetting:             entityApi('app_settings'),
  AuditLog:               entityApi('audit_logs'),
  FoodCostDaily:          entityApi('food_cost_daily'),
  GapAnalysis:            entityApi('gap_analysis'),
  GRN:                    entityApi('grns'),
  GRNIncident:            entityApi('grn_incidents'),
  GRNLine:                entityApi('grn_lines'),
  IntegrationSyncState:   entityApi('integration_sync_states'),
  Inventory:              entityApi('inventories'),
  InventoryLine:          entityApi('inventory_lines'),
  LedgerMovement:         entityApi('ledger_movements'),
  Location:               entityApi('locations'),
  Notification:           entityApi('notifications'),
  POLine:                 entityApi('po_lines'),
  Product:                entityApi('products'),
  PurchaseOrder:          entityApi('purchase_orders'),
  Recipe:                 entityApi('recipes'),
  RecipeLine:             entityApi('recipe_lines'),
  Recommendation:         entityApi('recommendations'),
  SalesDaily:             entityApi('sales_daily'),
  SalesItem:              entityApi('sales_items'),
  StockOnHand:            entityApi('stock_on_hand'),
  StorageArea:            entityApi('storage_areas'),
  Supplier:               entityApi('suppliers'),
  SystemError:            entityApi('system_errors'),
  TheoreticalConsumption: entityApi('theoretical_consumptions'),
  Unit:                   entityApi('units'),
};

// ── Legacy default export (keeps old imports working) ─────────────────────────
export const marginbites = {
  auth,
  appLogs,
  entities,
};

export default marginbites;
