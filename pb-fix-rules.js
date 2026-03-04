// pb-fix-rules.js — Pone listRule/viewRule/createRule/updateRule/deleteRule = ""
// en todas las colecciones para que el frontend pueda acceder sin autenticación.
// Uso: node pb-fix-rules.js

const PB_URL   = 'https://navic-pocketbase.2e26n3.easypanel.host';
const EMAIL    = 'visualandgrowth@gmail.com';
const PASSWORD = 'Barcelona1997';

const OPEN_RULES = {
  listRule:   '',
  viewRule:   '',
  createRule: '',
  updateRule: '',
  deleteRule: '',
};

async function auth() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.token;
}

async function getCollections(token) {
  const res = await fetch(`${PB_URL}/api/collections?perPage=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.items;
}

async function patchRules(token, col) {
  const res = await fetch(`${PB_URL}/api/collections/${col.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(OPEN_RULES),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  console.log('Autenticando...');
  const token = await auth();
  console.log('✓ Autenticado\n');

  const collections = await getCollections(token);
  // Skip system collections (users, _superusers, etc.)
  const custom = collections.filter(c => !c.system);
  console.log(`${custom.length} colecciones encontradas\n`);

  let ok = 0, fail = 0;
  for (const col of custom) {
    try {
      await patchRules(token, col);
      console.log(`✓ ${col.name}`);
      ok++;
    } catch (err) {
      console.error(`✗ ${col.name}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} actualizadas, ${fail} fallidas`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
