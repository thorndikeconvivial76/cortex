# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Cortex, please report it responsibly.

**Email:** security@k2n2studio.com

**SLA:**
- Acknowledgement within 48 hours
- Patch within 7 days for critical issues
- GitHub Security Advisory for public disclosure

**Do NOT:**
- Open a public GitHub issue for security vulnerabilities
- Share vulnerability details publicly before a fix is released

## Security Architecture

- All data stored locally by default (SQLite at `~/.cortex/memory.db`)
- File permissions set to `600` (owner read/write only)
- Session transcripts encrypted with AES-256-GCM
- Encryption key derived via HKDF-SHA256 from machine UUID
- MCP server listens on `localhost:7434` only — not exposed to network
- Quality gate blocks API keys, tokens, passwords, and credentials from being stored
- PIN auth (bcrypt, cost factor 12) available for shared machines
- Zero telemetry without explicit opt-in
- Clean uninstall leaves zero footprint

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Hall of Fame

Contributors who responsibly disclose vulnerabilities will be recognized here.
