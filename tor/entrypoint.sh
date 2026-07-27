#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

case "$PUID:$PGID" in
  *[!0-9:]*|:*|*:)
    echo "Pages Tor: invalid PUID/PGID: $PUID:$PGID" >&2
    exit 1
    ;;
esac

if [ "$(id -u)" -eq 0 ]; then
  mkdir -p /var/lib/tor /run/tor-control
  rm -f /run/tor-control/control /run/tor-control/control.authcookie
  chown -R "$PUID:$PGID" /var/lib/tor /run/tor-control
  chmod 0700 /var/lib/tor /run/tor-control
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
