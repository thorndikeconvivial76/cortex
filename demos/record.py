#!/usr/bin/env python3
"""Generate an asciinema .cast file for the Cortex demo, then convert to GIF."""

import json
import os
import subprocess
import sys

CAST_FILE = "demos/cortex-demo.cast"
GIF_FILE = "assets/cortex-demo.gif"

events = []
t = 0.0

def out(text, delay=0.0):
    global t
    t += delay
    events.append([round(t, 4), "o", text])

def line(text, delay=0.1):
    out(text + "\r\n", delay)

def type_text(text, char_delay=0.045):
    for ch in text:
        out(ch, char_delay)

def prompt(delay=0.5):
    out("\x1b[32m❯\x1b[0m ", delay)

def enter(delay=0.3):
    out("\r\n", delay)

def pause(seconds):
    global t
    t += seconds

# --- Scene 1: cortex init ---
prompt(0.8)
type_text("cortex init")
enter(0.3)
pause(0.6)

line("")
line("  \x1b[32m✓\x1b[0m Cortex v1.0.0 installed", 0.15)
line("  \x1b[32m✓\x1b[0m Daemon started (PID 48291)", 0.15)
line("  \x1b[32m✓\x1b[0m MCP server registered with Claude Code", 0.15)
line("  \x1b[32m✓\x1b[0m Database created (~/.cortex/cortex.db)", 0.15)
line("")
line("  Cortex is ready. Open Claude Code \u2014 it will remember.", 0.1)
line("")

# --- Scene 2: cortex status ---
prompt(1.8)
type_text("cortex status")
enter(0.3)
pause(0.5)

line("")
line("  Daemon:     \x1b[32mrunning\x1b[0m (PID 48291, uptime 3d 14h)", 0.12)
line("  MCP Server: localhost:7434 (5 tools)", 0.1)
line("  Dashboard:  localhost:7433", 0.1)
line("  Database:   ~/.cortex/cortex.db (2.1 MB)", 0.1)
line("")
line("  Projects:", 0.1)
line("    \x1b[36mmy-saas-app\x1b[0m       89 memories \x1b[32m(active)\x1b[0m", 0.12)
line("    cortex            34 memories", 0.1)
line("    infra-scripts     12 memories", 0.1)
line("    Total:           135 memories across 3 projects", 0.1)
line("")

# --- Scene 3: cortex show ---
prompt(1.8)
type_text("cortex show my-saas-app --type decision")
enter(0.3)
pause(0.5)

line("")
line("  \x1b[1m# Decision memories for my-saas-app\x1b[0m (4 of 23)", 0.1)
line("")
line("  \x1b[33m[1]\x1b[0m importance:\x1b[36m9\x1b[0m  2025-03-18  \x1b[90m#database #orm\x1b[0m", 0.18)
line("      Using Drizzle ORM \u2014 better edge runtime support, no binary dep", 0.08)
line("")
line("  \x1b[33m[2]\x1b[0m importance:\x1b[36m8\x1b[0m  2025-03-17  \x1b[90m#react #architecture\x1b[0m", 0.18)
line("      Server components by default, use client only for state/effects", 0.08)
line("")
line("  \x1b[33m[3]\x1b[0m importance:\x1b[36m8\x1b[0m  2025-03-16  \x1b[90m#auth\x1b[0m", 0.18)
line("      Clerk for auth, Supabase for DB only \u2014 no Supabase auth/storage", 0.08)
line("")
line("  \x1b[33m[4]\x1b[0m importance:\x1b[36m7\x1b[0m  2025-03-15  \x1b[90m#styling\x1b[0m", 0.18)
line("      Tailwind 4 + CVA for component variants, no CSS modules", 0.08)
line("")

# --- Scene 4: cortex search ---
prompt(1.8)
type_text('cortex search "websocket timeout"')
enter(0.3)
pause(0.5)

line("")
line("  Found \x1b[1m2 matches\x1b[0m across 1 project:", 0.1)
line("")
line("  \x1b[36m[my-saas-app]\x1b[0m \x1b[35mthread\x1b[0m (importance:7)", 0.15)
line("    WebSocket drops after 100s \u2014 suspect Cloudflare proxy timeout", 0.08)
line("")
line("  \x1b[36m[my-saas-app]\x1b[0m \x1b[31merror\x1b[0m (importance:6)", 0.15)
line("    Reconnection loop when server restarts during active WS session", 0.08)
line("")

prompt(2.0)
pause(2.0)

# --- Write cast file ---
header = {
    "version": 2,
    "width": 82,
    "height": 26,
    "env": {"SHELL": "/bin/bash", "TERM": "xterm-256color"}
}

os.makedirs(os.path.dirname(CAST_FILE), exist_ok=True)
with open(CAST_FILE, "w") as f:
    f.write(json.dumps(header) + "\n")
    for ev in events:
        f.write(json.dumps(ev) + "\n")

print(f"Cast file: {CAST_FILE} ({len(events)} events)")

# --- Convert to GIF ---
os.makedirs(os.path.dirname(GIF_FILE), exist_ok=True)
result = subprocess.run(
    ["agg", "--theme", "dracula", "--font-size", "14", CAST_FILE, GIF_FILE],
    capture_output=True, text=True
)

if result.returncode != 0:
    print(f"agg error: {result.stderr}")
    sys.exit(1)

size = os.path.getsize(GIF_FILE)
print(f"GIF created: {GIF_FILE} ({size / 1024 / 1024:.1f} MB)")
