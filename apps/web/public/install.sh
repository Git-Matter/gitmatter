#!/bin/sh
# gitmatter installer — https://gitmatter.com/install.sh
#
#   curl -fsSL gitmatter.com/install.sh | sh
#
# Downloads the gitmatter CLI binary for this platform from GitHub Releases
# and puts it on PATH. The CLI then handles everything else (Docker stack,
# Postgres, object storage, migrations) via `gitmatter init` + `gitmatter up`.
set -eu

REPO="Git-Matter/gitmatter"
INSTALL_NAME="gitmatter"

say() { printf '\033[36m[gitmatter]\033[0m %s\n' "$1"; }
fail() {
  printf '\033[31m[gitmatter]\033[0m %s\n' "$1" >&2
  exit 1
}

# ── platform ─────────────────────────────────────────────────────────────────
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  MINGW* | MSYS* | CYGWIN*)
    fail "Windows: download gitmatter-win-x64.exe from https://github.com/$REPO/releases/latest"
    ;;
  *) fail "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
  arm64 | aarch64) arch="arm64" ;;
  x86_64 | amd64) arch="x64" ;;
  *) fail "Unsupported architecture: $ARCH" ;;
esac

# Only darwin-arm64, darwin-x64 and linux-x64 binaries are published.
[ "$os-$arch" = "linux-arm64" ] &&
  fail "No linux-arm64 binary yet. Build from source: https://github.com/$REPO/tree/main/cli"

ASSET="gitmatter-$os-$arch"
URL="https://github.com/$REPO/releases/latest/download/$ASSET"

# ── download ─────────────────────────────────────────────────────────────────
command -v curl >/dev/null 2>&1 || fail "curl is required."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

say "downloading gitmatter ($os-$arch) …"
curl -fsSL "$URL" -o "$TMP/$INSTALL_NAME" ||
  fail "Download failed: $URL — check https://github.com/$REPO/releases"
chmod +x "$TMP/$INSTALL_NAME"

# ── install ──────────────────────────────────────────────────────────────────
# Prefer /usr/local/bin when writable; fall back to ~/.local/bin (no sudo).
if [ -w /usr/local/bin ]; then
  BIN_DIR="/usr/local/bin"
else
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
fi

mv "$TMP/$INSTALL_NAME" "$BIN_DIR/$INSTALL_NAME"
say "installed to $BIN_DIR/$INSTALL_NAME"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    say "note: $BIN_DIR is not on your PATH. Add it to your shell profile:"
    say "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

# ── docker (needed at `gitmatter up`, not now — warn, don't fail) ────────────
if ! command -v docker >/dev/null 2>&1; then
  say "note: Docker not found. It's the one prerequisite — \`gitmatter up\` needs it."
  say "  Install Docker Desktop: https://docs.docker.com/get-docker/"
  say "  Then \`gitmatter doctor\` verifies everything."
fi

say "done. Next:"
say "  gitmatter init   # domain + database, generates secrets"
say "  gitmatter up     # start everything, print the URL"
