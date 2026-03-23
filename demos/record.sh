#!/usr/bin/env bash
# Record Cortex demo as .cast then convert to .gif
# Usage: ./demos/record.sh

set -e
cd "$(dirname "$0")/.."

CAST_FILE="demos/cortex-demo.cast"
GIF_FILE="assets/cortex-demo.gif"
MOCK="demos/mock/cortex"

# Create the .cast file programmatically (no interactive recording needed)
cat > "$CAST_FILE" << 'HEADER'
{"version": 2, "width": 82, "height": 24, "timestamp": 1711152000, "env": {"SHELL": "/bin/bash", "TERM": "xterm-256color"}}
HEADER

T=0.0

add_line() {
  local delay=$1
  local text=$2
  T=$(echo "$T + $delay" | bc)
  printf '[%.6f, "o", "%s\\r\\n"]\n' "$T" "$text" >> "$CAST_FILE"
}

add_typing() {
  local text=$1
  local char_delay=0.04
  for (( i=0; i<${#text}; i++ )); do
    char="${text:$i:1}"
    T=$(echo "$T + $char_delay" | bc)
    # Escape special chars for JSON
    case "$char" in
      '"') char='\\"' ;;
      '\\') char='\\\\' ;;
    esac
    printf '[%.6f, "o", "%s"]\n' "$T" "$char" >> "$CAST_FILE"
  done
}

add_prompt() {
  local delay=$1
  T=$(echo "$T + $delay" | bc)
  printf '[%.6f, "o", "\\u001b[32m❯\\u001b[0m "]\n' "$T" >> "$CAST_FILE"
}

add_newline() {
  local delay=$1
  T=$(echo "$T + $delay" | bc)
  printf '[%.6f, "o", "\\r\\n"]\n' "$T" >> "$CAST_FILE"
}

# Scene 1: cortex init
add_prompt 0.5
add_typing "cortex init"
add_newline 0.3

T=$(echo "$T + 0.5" | bc)
add_line 0.1 ""
add_line 0.1 "  \\u001b[32m✓\\u001b[0m Cortex v1.0.0 installed"
add_line 0.1 "  \\u001b[32m✓\\u001b[0m Daemon started (PID 48291)"
add_line 0.1 "  \\u001b[32m✓\\u001b[0m MCP server registered with Claude Code"
add_line 0.1 "  \\u001b[32m✓\\u001b[0m Database created (~/.cortex/cortex.db)"
add_line 0.1 ""
add_line 0.1 "  Cortex is ready. Open Claude Code — it will remember."
add_line 0.1 ""

# Scene 2: cortex status
add_prompt 1.5
add_typing "cortex status"
add_newline 0.3

T=$(echo "$T + 0.5" | bc)
add_line 0.1 ""
add_line 0.1 "  Daemon:     \\u001b[32mrunning\\u001b[0m (PID 48291, uptime 3d 14h)"
add_line 0.1 "  MCP Server: localhost:7434 (5 tools)"
add_line 0.1 "  Dashboard:  localhost:7433"
add_line 0.1 "  Database:   ~/.cortex/cortex.db (2.1 MB)"
add_line 0.1 ""
add_line 0.1 "  Projects:"
add_line 0.1 "    \\u001b[36mmy-saas-app\\u001b[0m       89 memories \\u001b[32m(active)\\u001b[0m"
add_line 0.1 "    cortex            34 memories"
add_line 0.1 "    infra-scripts     12 memories"
add_line 0.1 "    Total:           135 memories across 3 projects"
add_line 0.1 ""

# Scene 3: cortex show
add_prompt 1.5
add_typing "cortex show my-saas-app --type decision"
add_newline 0.3

T=$(echo "$T + 0.5" | bc)
add_line 0.1 ""
add_line 0.1 "  \\u001b[1m# Decision memories for my-saas-app\\u001b[0m (4 of 23)"
add_line 0.1 ""
add_line 0.15 "  \\u001b[33m[1]\\u001b[0m importance:\\u001b[36m9\\u001b[0m  2025-03-18  \\u001b[90m#database #orm\\u001b[0m"
add_line 0.1 "      Using Drizzle ORM — better edge runtime support, no binary dep"
add_line 0.1 ""
add_line 0.15 "  \\u001b[33m[2]\\u001b[0m importance:\\u001b[36m8\\u001b[0m  2025-03-17  \\u001b[90m#react #architecture\\u001b[0m"
add_line 0.1 "      Server components by default, use client only for state/effects"
add_line 0.1 ""
add_line 0.15 "  \\u001b[33m[3]\\u001b[0m importance:\\u001b[36m8\\u001b[0m  2025-03-16  \\u001b[90m#auth\\u001b[0m"
add_line 0.1 "      Clerk for auth, Supabase for DB only — no Supabase auth/storage"
add_line 0.1 ""
add_line 0.15 "  \\u001b[33m[4]\\u001b[0m importance:\\u001b[36m7\\u001b[0m  2025-03-15  \\u001b[90m#styling\\u001b[0m"
add_line 0.1 "      Tailwind 4 + CVA for component variants, no CSS modules"
add_line 0.1 ""

# Scene 4: cortex search
add_prompt 1.5
add_typing "cortex search \"websocket timeout\""
add_newline 0.3

T=$(echo "$T + 0.5" | bc)
add_line 0.1 ""
add_line 0.1 "  Found \\u001b[1m2 matches\\u001b[0m across 1 project:"
add_line 0.1 ""
add_line 0.15 "  \\u001b[36m[my-saas-app]\\u001b[0m \\u001b[35mthread\\u001b[0m (importance:7)"
add_line 0.1 "    WebSocket drops after 100s — suspect Cloudflare proxy timeout"
add_line 0.1 ""
add_line 0.15 "  \\u001b[36m[my-saas-app]\\u001b[0m \\u001b[31merror\\u001b[0m (importance:6)"
add_line 0.1 "    Reconnection loop when server restarts during active WS session"
add_line 0.1 ""

# Final pause
add_prompt 2.0

echo "Cast file created: $CAST_FILE"
echo "Converting to GIF..."

agg --theme dracula \
    --font-size 14 \
    --cols 82 \
    --rows 24 \
    --speed 1 \
    "$CAST_FILE" "$GIF_FILE"

echo "Done: $GIF_FILE"
ls -lh "$GIF_FILE"
