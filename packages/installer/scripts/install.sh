#!/bin/bash
set -euo pipefail

# Cortex Installer — curl -fsSL install.cortex.sh | sh
# Detects OS + arch, installs cortex, runs cortex init.

CORTEX_VERSION="1.0.0"
INSTALL_DIR="/usr/local/bin"
REPO="ProductionLineHQ/cortex"

echo ""
echo "  C●rtex — Persistent Memory for Claude Code"
echo "  v${CORTEX_VERSION}"
echo ""

# ── Detect OS + Architecture ──
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) PLATFORM="darwin" ;;
  linux)  PLATFORM="linux" ;;
  *)
    echo "✗ Unsupported OS: $OS"
    echo "  Cortex supports macOS and Linux. For Windows, use npx @cortex-memory/cli init"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "✗ Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

echo "· Detected: $PLATFORM $ARCH"

# ── Check Node.js ──
if ! command -v node &> /dev/null; then
  echo "✗ Node.js not found."
  echo "  Cortex requires Node.js >= 18. Install from https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ Node.js v$(node --version) — requires >= 18"
  echo "  Download from https://nodejs.org"
  exit 1
fi
echo "✓ Node.js v$(node --version)"

# ── Install via npm ──
echo "· Installing @cortex-memory/cli..."
npm install -g @cortex-memory/cli 2>/dev/null || {
  echo "⚡ Global npm install failed. Trying with sudo..."
  sudo npm install -g @cortex-memory/cli
}

# ── Run init ──
echo ""
cortex init

echo ""
echo "✓ Cortex installed successfully!"
echo "  Open Claude Code in any project folder to start."
echo ""
