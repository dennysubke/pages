#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
TOR_SITE_SOCKET_DIR="${TOR_SITE_SOCKET_DIR:-/site-socket}"

case "$PUID:$PGID" in
  *[!0-9:]*|:*|*:)
    echo "Pages: invalid PUID/PGID: $PUID:$PGID" >&2
    exit 1
    ;;
esac

if [ "$(id -u)" -eq 0 ]; then
  mkdir -p "$DATA_DIR" "$DATA_DIR/sites" "$DATA_DIR/backups" "$DATA_DIR/tmp" "$DATA_DIR/tor/keys" "$TOR_SITE_SOCKET_DIR"

  # Umbrel creates the host bind-mount as root on first install. Ensure that the
  # unprivileged Pages process can initialize and maintain its persistent data.
  chown -R "$PUID:$PGID" "$DATA_DIR" "$TOR_SITE_SOCKET_DIR"

  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
