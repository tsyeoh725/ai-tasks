#!/usr/bin/env bash
# Print fresh random values for the three secrets ai-tasks needs.
# Copy the output into /srv/ai-tasks/.env.production.
#
# Usage:
#   bash deploy/generate-secrets.sh
#
# Notes:
#   - VAPID keys must be generated ONCE per environment. If you regenerate
#     them, every existing push subscription stops working until users
#     resubscribe in the UI.
#   - NEXTAUTH_SECRET can be rotated, but rotating it invalidates all
#     active sessions — users will need to log in again.
#   - API_KEY_SALT can be rotated, but rotating it invalidates all
#     previously-generated API keys.

set -euo pipefail

echo "# --- Paste these lines into .env.production ---"
echo
echo "NEXTAUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "API_KEY_SALT=$(openssl rand -hex 32)"
echo

# Generate VAPID via web-push — requires node_modules/web-push installed.
if command -v npx >/dev/null; then
    if vapid="$(npx --yes web-push generate-vapid-keys --json 2>/dev/null)"; then
        pub=$(printf '%s' "$vapid" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)
        prv=$(printf '%s' "$vapid" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)
        echo "NEXT_PUBLIC_VAPID_PUBLIC_KEY=${pub}"
        echo "VAPID_PRIVATE_KEY=${prv}"
    else
        echo "# Could not generate VAPID keys with web-push. Run:"
        echo "#   npx web-push generate-vapid-keys"
    fi
else
    echo "# npx not found — install Node first, then run:"
    echo "#   npx web-push generate-vapid-keys"
fi

echo
echo "# VAPID_SUBJECT can be any mailto: or https URL you own:"
echo "VAPID_SUBJECT=mailto:you@example.com"
