# Homebrew Tap for Cortex

This is the Homebrew tap for [Cortex](https://cortex.sh) — persistent memory for Claude Code.

## Installation

```bash
brew tap ProductionLineHQ/cortex
brew install cortex
```

## Post-install

```bash
cortex init
```

## Start as a service

```bash
brew services start cortex
```

## Update

```bash
brew upgrade cortex
```

## Uninstall

```bash
brew uninstall cortex
brew untap ProductionLineHQ/cortex
```

## Repository

This tap is published at [github.com/ProductionLineHQ/homebrew-cortex](https://github.com/ProductionLineHQ/homebrew-cortex).

The formula pulls `@cortex-memory/cli` from the npm registry.

## Publishing a new version

1. Publish new version to npm: `pnpm -F @cortex/cli publish`
2. Download the tarball: `curl -O https://registry.npmjs.org/@cortex-memory/cli/-/cli-X.Y.Z.tgz`
3. Get SHA256: `shasum -a 256 cli-X.Y.Z.tgz`
4. Update `cortex.rb`: version URL and sha256
5. Push to this repo
6. Users get it on next `brew update`
