#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-latest}"
INSTALL_DIR="${M2_BRAINSTORM_HOME:-$HOME/.config/m2-brainstorm}"
BIN_DIR="$INSTALL_DIR/bin"
SRC_DIR="$INSTALL_DIR/src"
mkdir -p "$BIN_DIR"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)   TARGET="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64)  TARGET="aarch64-unknown-linux-gnu" ;;
  Linux-arm64)    TARGET="aarch64-unknown-linux-gnu" ;;
  Darwin-x86_64)  TARGET="x86_64-apple-darwin" ;;
  Darwin-arm64)   TARGET="aarch64-apple-darwin" ;;
  *)              TARGET="" ;;
esac

GH_OWNER="${GH_OWNER:-kellenff}"
GH_REPO="${GH_REPO:-m2-deep-research}"
if [ "$VERSION" = "latest" ]; then
  RELEASE_URL="https://github.com/$GH_OWNER/$GH_REPO/releases/latest/download"
else
  RELEASE_URL="https://github.com/$GH_OWNER/$GH_REPO/releases/download/$VERSION"
fi

if [ -n "$TARGET" ]; then
  curl -fsSL -o "$BIN_DIR/m2-brainstorm" "$RELEASE_URL/m2-brainstorm-$TARGET"
  curl -fsSL -o "$BIN_DIR/m2-research"   "$RELEASE_URL/m2-research-$TARGET"
  chmod +x "$BIN_DIR/m2-brainstorm" "$BIN_DIR/m2-research"
  echo "Installed pre-compiled binaries for $TARGET to $BIN_DIR"
else
  if ! command -v deno > /dev/null; then
    cat >&2 <<EOF
Error: no pre-compiled binary available for $(uname -s)-$(uname -m), and 'deno' is not on PATH.

Options:
  1. Install Deno: https://docs.deno.com/runtime/manual/getting_started/installation
  2. File a request for this platform: https://github.com/$GH_OWNER/$GH_REPO/issues
EOF
    exit 1
  fi
  mkdir -p "$SRC_DIR"
  curl -fsSL "$RELEASE_URL/m2-brainstorm-source.tar.gz" | tar xz -C "$SRC_DIR"
  cat > "$BIN_DIR/m2-brainstorm" <<EOF
#!/usr/bin/env bash
exec deno run --allow-net --allow-env --allow-read --allow-write --allow-run \
  "$SRC_DIR/brainstorm.ts" "$@"
EOF
  cat > "$BIN_DIR/m2-research" <<EOF
#!/usr/bin/env bash
exec deno run --allow-net --allow-env --allow-read --allow-write --allow-run \
  "$SRC_DIR/research.ts" "$@"
EOF
  chmod +x "$BIN_DIR/m2-brainstorm" "$BIN_DIR/m2-research"
  echo "Installed source + deno-run wrappers to $BIN_DIR"
fi
