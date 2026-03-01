import PocketBase from 'pocketbase';

const getEnv = (key) => (typeof window !== 'undefined' && window.__ENV__?.[key]) || import.meta.env[key] || '';

export const pb = new PocketBase(getEnv('VITE_POCKETBASE_URL') || 'http://localhost:8090');

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

const entityApi = (collectionName) => ({
  filter: (filters = {}, opts = {}) =>
    pb.collection(collectionName).getFullList({
      filter: toFilter(filters) || undefined,
      sort: opts.sort ?? '-created',
    }),
  get: (id) => pb.collection(collectionName).getOne(id),
  create: (data) => pb.collection(collectionName).create(data),
  update: (id, data) => pb.collection(collectionName).update(id, data),
  delete: (id) => pb.collection(collectionName).delete(id),
});

export const marginbites = {
  // Auth stub — PocketBase rules are null (open). Wire real PB auth here if needed.
  auth: {
    me: () => Promise.resolve({ full_name: 'Admin', email: 'admin@marginbites.com', role: 'admin' }),
    logout: () => {},
    redirectToLogin: () => {},
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
