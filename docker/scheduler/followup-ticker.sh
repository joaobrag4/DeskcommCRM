#!/bin/sh
# Tick dedicado do motor de follow-up. O busybox crond só agenda por minuto;
# este laço inicia uma rodada a cada 10 s sem sobrepor chamadas lentas.
set -eu

if [ -z "${INTERNAL_SECRET:-}" ]; then
  echo "flow-ticker: INTERNAL_SECRET vazio; recusando iniciar." >&2
  exit 1
fi

APP_ORIGIN="http://app:3000"
AUTH_DIR="/run/deskcomm-flow-ticker"
AUTH_FILE="$AUTH_DIR/header"
umask 077
mkdir -p "$AUTH_DIR"
chmod 700 "$AUTH_DIR"
printf 'Authorization: Bearer %s\n' "$INTERNAL_SECRET" > "$AUTH_FILE"
chmod 600 "$AUTH_FILE"
unset INTERNAL_SECRET

trap 'exit 0' TERM INT

while :; do
  inicio="$(date +%s)"
  if curl -fsS -m 25 -H "@$AUTH_FILE" \
    "$APP_ORIGIN/api/v1/cron/followup-flow-worker" >/dev/null; then
    duracao=$(($(date +%s) - inicio))
    pausa=$((10 - duracao))
    if [ "$pausa" -gt 0 ]; then
      sleep "$pausa" &
      wait "$!" || true
    fi
  else
    echo "flow-ticker: chamada falhou; tentando novamente no próximo ciclo." >&2
    sleep 10 &
    wait "$!" || true
  fi
done
