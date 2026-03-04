// pb-import.js — Crea las colecciones en PocketBase vía API REST
// Uso: node pb-import.js
// Requiere Node.js 18+ (fetch nativo)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PB_URL  = 'https://navic-pocketbase.2e26n3.easypanel.host';
const EMAIL   = 'visualandgrowth@gmail.com';
const PASSWORD = 'Barcelona1997';

// ── Auth ────────────────────────────────────────────────────────────────────
async function authSuperuser() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.token;
}

// ── Import masivo ────────────────────────────────────────────────────────────
async function importAll(token, collections) {
  const res = await fetch(`${PB_URL}/api/collections/import`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ collections, deleteMissing: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data, null, 2));
  return data;
}

// ── Creación individual ──────────────────────────────────────────────────────
async function createOne(token, col) {
  const res = await fetch(`${PB_URL}/api/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(col),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data, null, 2));
  return data;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const collections = JSON.parse(
  readFileSync(path.join(__dirname, 'pocketbase-schema.json'), 'utf-8')
);

async function main() {
  console.log(`Conectando a ${PB_URL}...`);
  const token = await authSuperuser();
  console.log('✓ Autenticado\n');

  // 1) Intentar import masivo
  console.log('Intentando import masivo...');
  try {
    await importAll(token, collections);
    console.log('✓ ¡Todas las colecciones importadas correctamente!');
    return;
  } catch (err) {
    console.error('✗ Import masivo falló:');
    console.error(err.message);
    console.log('\nIntentando crear colecciones una por una...\n');
  }

  // 2) Creación individual para identificar cuál falla
  let ok = 0, fail = 0;
  for (const col of collections) {
    try {
      await createOne(token, col);
      console.log(`✓ ${col.name}`);
      ok++;
    } catch (err) {
      console.error(`✗ ${col.name}:`);
      // Mostrar detalles del error
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.data) {
          for (const [k, v] of Object.entries(parsed.data)) {
            console.error(`    ${k}: ${v?.message || JSON.stringify(v)}`);
          }
        } else {
          console.error(`  ${err.message}`);
        }
      } catch {
        console.error(`  ${err.message}`);
      }
      fail++;
    }
  }
  console.log(`\nResultado: ${ok} creadas, ${fail} fallidas`);
}

main().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
