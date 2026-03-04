/**
 * tSpoonLab REST API client
 *
 * Base URL : https://app.tspoonlab.com/recipes/api
 * Auth     : POST /login (form-urlencoded) → token
 * Headers  : rememberme: <token>  +  order: <idOrderCenter>
 */

const BASE_URL = 'https://app.tspoonlab.com/recipes/api';

// ── Low-level helpers ─────────────────────────────────────────────────────────

function headers(token, idOrderCenter, extra = {}) {
  return {
    'rememberme': token,
    'order': String(idOrderCenter),
    'Accept': 'application/json',
    ...extra,
  };
}

async function request(method, path, { token, idOrderCenter, body, params } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const init = {
    method,
    headers: headers(token, idOrderCenter, body ? { 'Content-Type': 'application/json' } : {}),
  };
  if (body) init.body = JSON.stringify(body);

  const res = await fetch(url.toString(), init);
  if (!res.ok) {
    let msg = res.statusText;
    try { const d = await res.json(); msg = d?.message || msg; } catch {}
    throw Object.assign(new Error(`tSpoonLab ${res.status}: ${msg}`), { status: res.status });
  }
  // Some endpoints return empty body on success
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Login to tSpoonLab.
 * @returns {Promise<string>} rememberme token
 */
export async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`tSpoonLab login failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // Token is returned as plain string or inside an object — handle both
  return typeof data === 'string' ? data : (data.token ?? data.rememberme ?? data);
}

/**
 * Get all cost centers (order centers) for the authenticated user.
 * @returns {Promise<Array<{id, idOrderCenter, descr, name, active}>>}
 */
export async function getOrderCenters(token) {
  return request('GET', '/orderCenters', { token, idOrderCenter: '' });
}

// ── Products / Ingredients ────────────────────────────────────────────────────

/**
 * List ingredients (paginated).
 * @param {string} token
 * @param {string|number} idOrderCenter
 * @param {{ start?, rows?, filter? }} [opts]
 */
export async function listIngredients(token, idOrderCenter, opts = {}) {
  return request('GET', '/listIngredientsPaged', {
    token, idOrderCenter,
    params: { start: opts.start ?? 0, rows: opts.rows ?? 100, filter: opts.filter },
  });
}

/**
 * Create an ingredient.
 */
export async function createIngredient(token, idOrderCenter, data) {
  return request('POST', '/ingredient', { token, idOrderCenter, body: data });
}

/**
 * Delete an ingredient.
 */
export async function deleteIngredient(token, idOrderCenter, idComponent) {
  return request('DELETE', `/ingredient/${idComponent}`, { token, idOrderCenter });
}

// ── Recipes / Elaborations ────────────────────────────────────────────────────

/**
 * List intermediate elaborations (recipes) paginated.
 */
export async function listRecipes(token, idOrderCenter, opts = {}) {
  return request('GET', '/listRecipesPaged', {
    token, idOrderCenter,
    params: { start: opts.start ?? 0, rows: opts.rows ?? 100, filter: opts.filter },
  });
}

/**
 * List final dishes paginated.
 */
export async function listDishes(token, idOrderCenter, opts = {}) {
  return request('GET', '/listDishesPaged', {
    token, idOrderCenter,
    params: { start: opts.start ?? 0, rows: opts.rows ?? 100, filter: opts.filter },
  });
}

/**
 * Get a single intermediate recipe by ID.
 */
export async function getRecipe(token, idOrderCenter, idRecipe) {
  return request('GET', `/recipe/${idRecipe}`, { token, idOrderCenter });
}

/**
 * Get a single final dish by ID.
 */
export async function getDish(token, idOrderCenter, idDish) {
  return request('GET', `/dish/${idDish}`, { token, idOrderCenter });
}

// ── Productions ───────────────────────────────────────────────────────────────

/**
 * List production partidas (days) paginated.
 */
export async function listProductions(token, idOrderCenter, opts = {}) {
  return request('GET', '/listPartidesPaged', {
    token, idOrderCenter,
    params: { start: opts.start ?? 0, rows: opts.rows ?? 100, filter: opts.filter },
  });
}

/**
 * Get production components for a specific day.
 * @param {string} id  - production day ID
 */
export async function getProductionComponents(token, idOrderCenter, id, opts = {}) {
  return request('GET', '/productionComponentList', {
    token, idOrderCenter,
    params: { id, start: opts.start ?? 0, rows: opts.rows ?? 100 },
  });
}

/**
 * Create a production record (single-step: create + complete).
 */
export async function createProduction(token, idOrderCenter, { idComponent, quantity, date }) {
  return request('POST', '/production/component', {
    token, idOrderCenter,
    body: { idComponent, quantity, date },
  });
}

// ── Units ─────────────────────────────────────────────────────────────────────

export async function listUnits(token, idOrderCenter) {
  return request('GET', '/units', { token, idOrderCenter });
}

// ── Convenience bundle ────────────────────────────────────────────────────────

export const tspoonlab = {
  login,
  getOrderCenters,
  listIngredients,
  createIngredient,
  deleteIngredient,
  listRecipes,
  listDishes,
  getRecipe,
  getDish,
  listProductions,
  getProductionComponents,
  createProduction,
  listUnits,
};

export default tspoonlab;
