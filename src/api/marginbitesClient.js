import PocketBase from 'pocketbase';

const getEnv = (key) => (typeof window !== 'undefined' && window.__ENV__?.[key]) || import.meta.env[key] || '';

const resolvedUrl = getEnv('VITE_POCKETBASE_URL') || 'http://localhost:8090';
console.log('[PB] baseURL =', resolvedUrl, '| window.__ENV__ =', typeof window !== 'undefined' ? window.__ENV__ : 'N/A');

export const pb = new PocketBase(resolvedUrl);

// Disable auto-cancellation so React Query doesn't conflict
pb.autoCancellation(false);

// Convert plain filter object → PocketBase filter string
// e.g. { location_id: 'abc', status: 'Draft' } → "location_id = 'abc' && status = 'Draft'"
const toFilter = (filters = {}) =>
  Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      if (typeof v === 'boolean') return `${k} = ${v}`;
      if (typeof v === 'number') return `${k} = ${v}`;
      return `${k} = '${v}'`;
    })
    .join(' && ');

// Build a URL-safe query object — never include filter unless it's a non-empty string
const buildQuery = (base, filterStr) => {
  const q = { ...base };
  if (filterStr && filterStr.trim()) q.filter = filterStr.trim();
  return q;
};

const entityApi = (collectionName) => ({
  // list(sort?, limit?) — uses pb.send for full control over query params
  list: (sort, limit) => {
    const query = buildQuery({ page: 1, perPage: limit || 100, sort: sort || '-created' });
    return pb.send(`/api/collections/${collectionName}/records`, { method: 'GET', query })
      .then(r => { const items = r.items || []; console.log(`[PB] list(${collectionName}) → ${items.length} items`); return items; })
      .catch(err => { console.error(`[PB] list(${collectionName}) ERROR:`, err?.status, err?.message); throw err; });
  },
  filter: (filters = {}, opts = {}) => {
    const f = toFilter(filters);
    const query = buildQuery({ page: 1, perPage: 500, sort: opts.sort ?? '-created' }, f);
    return pb.send(`/api/collections/${collectionName}/records`, { method: 'GET', query })
      .then(r => { const items = r.items || []; console.log(`[PB] filter(${collectionName}, "${f || ''}") → ${items.length} items`); return items; })
      .catch(err => { console.error(`[PB] filter(${collectionName}) ERROR:`, err?.status, err?.message); throw err; });
  },
  get: (id) => {
    if (!id) return Promise.resolve(null);
    return pb.collection(collectionName).getOne(id);
  },
  create: (data) => pb.collection(collectionName).create(data),
  update: (id, data) => {
    if (!id) return Promise.reject(new Error(`update sin id en ${collectionName}`));
    return pb.collection(collectionName).update(id, data);
  },
  delete: (id) => {
    if (!id) return Promise.reject(new Error(`delete sin id en ${collectionName}`));
    return pb.collection(collectionName).delete(id);
  },
});

export const marginbites = {
  auth: {
    me: () => {
      if (!pb.authStore.isValid) return Promise.reject(new Error('Not authenticated'));
      const model = pb.authStore.model;
      // PocketBase users don't have a role field by default — inject admin until
      // a proper role field is added to the users collection.
      return Promise.resolve({ ...model, role: model?.role || 'admin' });
    },
    logout: () => { pb.authStore.clear(); window.location.href = '/login'; },
    redirectToLogin: () => { window.location.href = '/login'; },
  },
  // Logging stub — was a Base44 feature, no-op here.
  appLogs: {
    logUserInApp: () => Promise.resolve(),
  },
  entities: {
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
  },
};
