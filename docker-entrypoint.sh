#!/bin/sh
# Generate runtime environment config so VITE_ vars work from EasyPanel's "Entorno" section
cat > /usr/share/nginx/html/env-config.js << JSEOF
window.__ENV__ = {
  "VITE_OPENAI_API_KEY": "${VITE_OPENAI_API_KEY:-}",
  "VITE_MARGINBITES_APP_ID": "${VITE_MARGINBITES_APP_ID:-}",
  "VITE_MARGINBITES_APP_BASE_URL": "${VITE_MARGINBITES_APP_BASE_URL:-}",
  "VITE_MARGINBITES_FUNCTIONS_VERSION": "${VITE_MARGINBITES_FUNCTIONS_VERSION:-}"
};
JSEOF
exec nginx -g "daemon off;"
