#!/bin/sh
# Generate runtime environment config so VITE_ vars work from EasyPanel's "Entorno" section
cat > /usr/share/nginx/html/env-config.js << JSEOF
window.__ENV__ = {
  "VITE_OPENAI_API_KEY": "${VITE_OPENAI_API_KEY:-}",
  "VITE_POCKETBASE_URL": "${VITE_POCKETBASE_URL:-}"
};
JSEOF
exec nginx -g "daemon off;"
