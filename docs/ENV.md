# Marginbites — Environment Variables

## EasyPanel "Entorno" (required for deployment)

Paste these into EasyPanel → marginbites service → Entorno:

```
VITE_POCKETBASE_URL=https://navic-pocketbase.2e26n3.easypanel.host
VITE_OPENAI_API_KEY=sk-proj-...
```

## All variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_POCKETBASE_URL` | **Yes** | `http://localhost:8090` | PocketBase backend URL (no trailing slash) |
| `VITE_OPENAI_API_KEY` | **Yes** | — | OpenAI secret key. Used for whisper-1, gpt-4o-mini (text + vision) |
| `VITE_MARGINBITES_APP_ID` | No | — | Legacy Base44 app identifier (unused in PocketBase rebuild) |
| `VITE_MARGINBITES_APP_BASE_URL` | No | — | Legacy Base44 base URL (unused) |
| `VITE_MARGINBITES_FUNCTIONS_VERSION` | No | — | Legacy Base44 functions version (unused) |

## How env injection works at runtime

1. EasyPanel sets env vars on the Docker container
2. On container start, `docker-entrypoint.sh` runs and generates:
   ```js
   // /usr/share/nginx/html/env-config.js
   window.__ENV__ = {
     "VITE_POCKETBASE_URL": "https://...",
     "VITE_OPENAI_API_KEY": "sk-proj-..."
   };
   ```
3. `index.html` loads `/env-config.js` synchronously BEFORE the Vite bundle
4. `marginbitesClient.js` reads: `window.__ENV__?.VITE_POCKETBASE_URL || import.meta.env.VITE_POCKETBASE_URL || ''`

## Local development (.env.local)

Create `C:/temp/Marginbites/.env.local`:
```
VITE_POCKETBASE_URL=http://localhost:8090
VITE_OPENAI_API_KEY=sk-proj-...
```

Vite loads `.env.local` automatically. Do NOT commit this file.

## Security notes

- `VITE_*` variables are embedded in the client bundle at build time (for `import.meta.env`) AND injected at runtime via `window.__ENV__`
- The `VITE_OPENAI_API_KEY` is **visible in the browser** — anyone with DevTools can read it
- For production rebuild: proxy all OpenAI calls through a PocketBase hook or serverless function so the key never reaches the client

## PocketBase environment (pocketbase service)

The PocketBase container does not need additional env vars beyond what EasyPanel auto-configures. Admin credentials are set via the PocketBase admin UI on first boot.

Superuser auth endpoint (v0.23): `POST /api/collections/_superusers/auth-with-password`
