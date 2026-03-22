#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Cortex Installer
# curl -fsSL https://cortex.sh/install | sh
#
# Installs Cortex — Persistent Memory for Claude Code
# Supports macOS (launchd) and Linux (systemd). WSL detected as Linux.
# Idempotent — safe to run multiple times.
# ═══════════════════════════════════════════════════════════════════════════════

CORTEX_VERSION="1.0.0"
CORTEX_HOME="${HOME}/.cortex"
CORTEX_PORT=7434
CORTEX_PKG="@cortex-memory/cli"
DRY_RUN=false

# ── Parse flags ──────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      echo "Usage: install.sh [--dry-run] [--help]"
      echo "  --dry-run   Print what would be done without making changes"
      exit 0
      ;;
  esac
done

# ── Colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ] && command -v tput &>/dev/null; then
  RED=$(tput setaf 1)
  GREEN=$(tput setaf 2)
  YELLOW=$(tput setaf 3)
  CYAN=$(tput setaf 6)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
else
  RED="" GREEN="" YELLOW="" CYAN="" BOLD="" RESET=""
fi

info()    { echo "${CYAN}  ·${RESET} $*"; }
success() { echo "${GREEN}  ✓${RESET} $*"; }
warn()    { echo "${YELLOW}  !${RESET} $*"; }
fail()    { echo "${RED}  ✗${RESET} $*"; exit 1; }

run() {
  if [ "$DRY_RUN" = true ]; then
    echo "${YELLOW}  [dry-run]${RESET} $*"
  else
    eval "$@"
  fi
}

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo "${BOLD}  C${CYAN}●${RESET}${BOLD}rtex${RESET} — Persistent Memory for Claude Code"
echo "  v${CORTEX_VERSION}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Step 1: Detect OS
# ═══════════════════════════════════════════════════════════════════════════════
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
IS_WSL=false

case "$OS" in
  darwin)
    PLATFORM="macos"
    ;;
  linux)
    PLATFORM="linux"
    # Detect WSL
    if grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null; then
      IS_WSL=true
      info "WSL detected — installing as Linux (systemd)"
    fi
    ;;
  mingw*|msys*|cygwin*)
    fail "Windows native is not supported. Use WSL instead:
    wsl --install
    Then run this installer inside WSL."
    ;;
  *)
    fail "Unsupported OS: $OS. Cortex supports macOS and Linux."
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) fail "Unsupported architecture: $ARCH" ;;
esac

success "Detected: ${PLATFORM} ${ARCH}${IS_WSL:+ (WSL)}"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 2: Check Node.js >= 18
# ═══════════════════════════════════════════════════════════════════════════════
if ! command -v node &>/dev/null; then
  fail "Node.js not found.
  Cortex requires Node.js >= 18. Install from https://nodejs.org
  Or via Homebrew: brew install node@18"
fi

NODE_VERSION=$(node --version | sed 's/^v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js v${NODE_VERSION} is too old — requires >= 18.
  Download from https://nodejs.org"
fi

success "Node.js v${NODE_VERSION}"

# Check npm
if ! command -v npm &>/dev/null; then
  fail "npm not found. Install Node.js from https://nodejs.org"
fi

success "npm v$(npm --version)"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 3: Create ~/.cortex/ directory
# ═══════════════════════════════════════════════════════════════════════════════
if [ -d "$CORTEX_HOME" ]; then
  success "Directory ${CORTEX_HOME} already exists"
else
  info "Creating ${CORTEX_HOME}..."
  run "mkdir -p '${CORTEX_HOME}'"
  success "Created ${CORTEX_HOME}"
fi

# Ensure logs directory exists
run "mkdir -p '${CORTEX_HOME}/logs'"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 4: Install @cortex-memory/cli via npm
# ═══════════════════════════════════════════════════════════════════════════════
if command -v cortex &>/dev/null; then
  EXISTING_VERSION=$(cortex --version 2>/dev/null || echo "unknown")
  warn "Cortex already installed (v${EXISTING_VERSION}) — upgrading..."
fi

info "Installing ${CORTEX_PKG}..."
if run "npm install -g ${CORTEX_PKG}@latest 2>&1"; then
  success "Installed ${CORTEX_PKG}"
else
  warn "Global install failed. Retry with sudo? [y/N]"
  read -r SUDO_CONFIRM < /dev/tty 2>/dev/null || SUDO_CONFIRM=""
  if [ "$SUDO_CONFIRM" = "y" ] || [ "$SUDO_CONFIRM" = "Y" ]; then
    if run "sudo npm install -g ${CORTEX_PKG}@latest 2>&1"; then
      success "Installed ${CORTEX_PKG} (with sudo)"
    else
      fail "Could not install ${CORTEX_PKG}.
  Check npm permissions: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
    fi
  else
    fail "Could not install ${CORTEX_PKG} without sudo.
  Check npm permissions: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Step 5: Initialize SQLite database
# ═══════════════════════════════════════════════════════════════════════════════
if [ -f "${CORTEX_HOME}/cortex.db" ]; then
  success "Database already exists at ${CORTEX_HOME}/cortex.db"
else
  info "Initializing Cortex database..."
  if ! run "cortex init --no-daemon 2>&1"; then
    fail "Database initialization failed. Run: cortex doctor --fix"
  fi
  if [ -f "${CORTEX_HOME}/cortex.db" ] || [ "$DRY_RUN" = true ]; then
    success "Database initialized"
  else
    fail "Database not created. Run: cortex doctor --fix"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Step 6: Set up daemon service
# ═══════════════════════════════════════════════════════════════════════════════
CORTEX_BIN=$(command -v cortex 2>/dev/null || echo "/usr/local/bin/cortex")

setup_launchd() {
  local PLIST_NAME="com.cortex.daemon"
  local PLIST_DIR="${HOME}/Library/LaunchAgents"
  local PLIST_PATH="${PLIST_DIR}/${PLIST_NAME}.plist"

  info "Setting up launchd daemon..."

  run "mkdir -p '${PLIST_DIR}'"

  # Unload existing if present
  if [ -f "$PLIST_PATH" ] && [ "$DRY_RUN" = false ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
  fi

  if [ "$DRY_RUN" = false ]; then
    cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${CORTEX_BIN}</string>
    <string>server</string>
    <string>--daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>WorkingDirectory</key>
  <string>${CORTEX_HOME}</string>
  <key>StandardOutPath</key>
  <string>${CORTEX_HOME}/logs/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>${CORTEX_HOME}/logs/error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CORTEX_PORT</key>
    <string>${CORTEX_PORT}</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
PLIST_EOF
  else
    echo "${YELLOW}  [dry-run]${RESET} Would write ${PLIST_PATH}"
  fi

  success "launchd plist created at ${PLIST_PATH}"
}

setup_systemd() {
  local SERVICE_DIR="${HOME}/.config/systemd/user"
  local SERVICE_PATH="${SERVICE_DIR}/cortex.service"

  info "Setting up systemd user service..."

  run "mkdir -p '${SERVICE_DIR}'"

  # Stop existing if running
  if systemctl --user is-active cortex &>/dev/null 2>&1; then
    run "systemctl --user stop cortex" || true
  fi

  if [ "$DRY_RUN" = false ]; then
    cat > "$SERVICE_PATH" << SERVICE_EOF
[Unit]
Description=Cortex Memory Daemon
After=network.target

[Service]
Type=simple
ExecStart=${CORTEX_BIN} server --daemon
Restart=on-failure
RestartSec=5
Environment=CORTEX_PORT=${CORTEX_PORT}
Environment=HOME=${HOME}
WorkingDirectory=${CORTEX_HOME}

[Install]
WantedBy=default.target
SERVICE_EOF
  else
    echo "${YELLOW}  [dry-run]${RESET} Would write ${SERVICE_PATH}"
  fi

  run "systemctl --user daemon-reload 2>/dev/null || true"
  run "systemctl --user enable cortex 2>/dev/null || true"

  success "systemd service created at ${SERVICE_PATH}"
}

if [ "$PLATFORM" = "macos" ]; then
  setup_launchd
elif [ "$PLATFORM" = "linux" ]; then
  setup_systemd
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Step 7: Wire Claude Code settings.json with MCP server
# ═══════════════════════════════════════════════════════════════════════════════
wire_claude_code() {
  local SETTINGS_DIR="${HOME}/.claude"
  local SETTINGS_FILE="${SETTINGS_DIR}/settings.json"

  info "Configuring Claude Code MCP integration..."

  run "mkdir -p '${SETTINGS_DIR}'"

  if [ "$DRY_RUN" = true ]; then
    echo "${YELLOW}  [dry-run]${RESET} Would update ${SETTINGS_FILE}"
    success "Claude Code MCP configuration ready"
    return
  fi

  # Build the MCP server entry
  local MCP_ENTRY
  MCP_ENTRY=$(cat << 'MCPJSON'
{
  "cortex": {
    "command": "cortex",
    "args": ["mcp"],
    "env": {
      "CORTEX_PORT": "7434"
    }
  }
}
MCPJSON
)

  if [ -f "$SETTINGS_FILE" ]; then
    # Check if cortex is already configured
    if command -v node &>/dev/null && node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync('${SETTINGS_FILE}', 'utf8'));
      if (settings.mcpServers && settings.mcpServers.cortex) {
        process.exit(0);
      }
      process.exit(1);
    " 2>/dev/null; then
      success "Claude Code MCP already configured"
      return
    fi

    # Merge cortex into existing settings
    node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync('${SETTINGS_FILE}', 'utf8'));
      if (!settings.mcpServers) settings.mcpServers = {};
      settings.mcpServers.cortex = {
        command: 'cortex',
        args: ['mcp'],
        env: { CORTEX_PORT: '${CORTEX_PORT}' }
      };
      fs.writeFileSync('${SETTINGS_FILE}', JSON.stringify(settings, null, 2) + '\n');
    " 2>/dev/null
  else
    # Create new settings file
    cat > "$SETTINGS_FILE" << SETTINGS_EOF
{
  "mcpServers": {
    "cortex": {
      "command": "cortex",
      "args": ["mcp"],
      "env": {
        "CORTEX_PORT": "${CORTEX_PORT}"
      }
    }
  }
}
SETTINGS_EOF
  fi

  success "Claude Code MCP configured at ${SETTINGS_FILE}"
}

wire_claude_code

# ═══════════════════════════════════════════════════════════════════════════════
# Step 8: Start daemon
# ═══════════════════════════════════════════════════════════════════════════════
start_daemon() {
  info "Starting Cortex daemon on port ${CORTEX_PORT}..."

  if [ "$PLATFORM" = "macos" ]; then
    local PLIST_PATH="${HOME}/Library/LaunchAgents/com.cortex.daemon.plist"
    if ! run "launchctl load -w '${PLIST_PATH}' 2>/dev/null"; then
      warn "Failed to load launchd plist. Run: launchctl load -w '${PLIST_PATH}'"
    fi
  elif [ "$PLATFORM" = "linux" ]; then
    if ! run "systemctl --user start cortex 2>/dev/null"; then
      warn "Failed to start systemd service. Run: systemctl --user start cortex"
    fi
  fi

  # Verify daemon is running
  if [ "$DRY_RUN" = false ]; then
    sleep 2
    if curl -s "http://localhost:${CORTEX_PORT}/health" &>/dev/null; then
      success "Daemon running on port ${CORTEX_PORT}"
    else
      warn "Daemon may not have started yet — run 'cortex doctor' to check"
    fi
  else
    success "Daemon start (dry-run)"
  fi
}

start_daemon

# ═══════════════════════════════════════════════════════════════════════════════
# Done
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "${BOLD}${GREEN}  ✓ Cortex installed successfully!${RESET}"
echo ""
echo "  ${BOLD}Next steps:${RESET}"
echo "    1. Open Claude Code in any project directory"
echo "    2. Cortex will automatically remember context across sessions"
echo ""
echo "  ${BOLD}Useful commands:${RESET}"
echo "    cortex status     — Check daemon and database status"
echo "    cortex doctor     — Diagnose configuration issues"
echo "    cortex logs       — View recent daemon logs"
echo ""
echo "  ${BOLD}Documentation:${RESET}  https://cortex.sh/docs"
echo ""
