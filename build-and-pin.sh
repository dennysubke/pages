#!/usr/bin/env bash
set -euo pipefail

WEB_IMAGE="dennysubke/pages"
TOR_IMAGE="dennysubke/pages-tor"
VERSION="0.1.0"
COMPOSE_FILE="${1:-../umbrel/denny-pages/docker-compose.yml}"
BUILDER="pages-builder"

for required in "$COMPOSE_FILE" Dockerfile Dockerfile.tor tor/torrc tor/entrypoint.sh; do
  if [[ ! -e "$required" ]]; then
    echo "Required file not found: $required" >&2
    exit 1
  fi
done

if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  docker buildx create --name "$BUILDER" --driver docker-container --use
else
  docker buildx use "$BUILDER"
fi

docker buildx inspect --bootstrap

build_image() {
  local image="$1"
  local dockerfile="$2"

  echo
  echo "Building ${image}:${VERSION} from ${dockerfile} without cache..."
  docker buildx build \
    --builder "$BUILDER" \
    --platform linux/amd64,linux/arm64 \
    --file "$dockerfile" \
    --no-cache \
    --pull \
    --progress=plain \
    --tag "$image:$VERSION" \
    --tag "$image:latest" \
    --push \
    .
}

read_digest() {
  local image="$1"

  # Consume the complete Buildx output. Using `head` here causes Docker Desktop
  # on Git Bash to report a broken stdout pipe after an otherwise successful push.
  docker buildx imagetools inspect "$image:$VERSION" 2>/dev/null |
    awk '$1 == "Digest:" && !found { print $2; found = 1 }'
}

pin_image() {
  local image="$1"
  local digest="$2"
  sed -i -E \
    "s#^([[:space:]]*)image: ${image}:${VERSION}(@sha256:[0-9a-f]+)?#\\1image: ${image}:${VERSION}@${digest}#" \
    "$COMPOSE_FILE"

  if ! grep -qF "image: ${image}:${VERSION}@${digest}" "$COMPOSE_FILE"; then
    echo "Could not update ${image} in ${COMPOSE_FILE}" >&2
    exit 1
  fi
}

build_image "$WEB_IMAGE" "Dockerfile"
build_image "$TOR_IMAGE" "Dockerfile.tor"

WEB_DIGEST="$(read_digest "$WEB_IMAGE")"
TOR_DIGEST="$(read_digest "$TOR_IMAGE")"

for digest in "$WEB_DIGEST" "$TOR_DIGEST"; do
  if [[ -z "$digest" || "$digest" != sha256:* ]]; then
    echo "Could not determine one of the multiarch digests." >&2
    exit 1
  fi
done

echo
echo "Published Pages digest:     $WEB_DIGEST"
echo "Published Pages Tor digest: $TOR_DIGEST"

if [[ -f "$COMPOSE_FILE" ]]; then
  pin_image "$WEB_IMAGE" "$WEB_DIGEST"
  pin_image "$TOR_IMAGE" "$TOR_DIGEST"
  echo "Pinned both images in $COMPOSE_FILE"
else
  echo "Compose file not found: $COMPOSE_FILE" >&2
  echo "Use these image references manually:" >&2
  echo "$WEB_IMAGE:$VERSION@$WEB_DIGEST" >&2
  echo "$TOR_IMAGE:$VERSION@$TOR_DIGEST" >&2
  exit 1
fi
