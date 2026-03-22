# Contributing to Cortex

## Setup

```bash
# Clone and install
git clone https://github.com/k2n2studio/cortex.git
cd cortex
pnpm install

# Build all packages
pnpm build

# Run dev mode (watches all packages)
pnpm dev
```

## Monorepo Structure

| Package | Description |
|---------|-------------|
| `packages/shared` | Types, schemas, constants |
| `packages/server` | Daemon: MCP server, REST API, SQLite |
| `packages/cli` | CLI with 26 commands |
| `packages/dashboard` | Web UI (Next.js 14) |
| `packages/electron` | Desktop app wrapper |
| `packages/vscode` | VS Code extension |
| `packages/installer` | Install scripts and daemon configs |

## Development

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint and typecheck
pnpm lint
pnpm typecheck
```

## Submitting Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes. Add tests if applicable.
3. Run `pnpm lint && pnpm typecheck && pnpm test` and confirm everything passes.
4. Submit a pull request. Keep the PR focused on a single concern.

## Code Style

- TypeScript everywhere (ESM modules).
- Use Zod for runtime validation (schemas live in `packages/shared`).
- Prefer small, pure functions over large classes.

## Reporting Issues

Open an issue with reproduction steps. Include your Node.js version and OS.
