<p align="center">
  <img src="static/banner.png" alt="DepRadar" width="900"/>
</p>
<p align="center">
  <strong>The most complete dependency audit MCP server.</strong><br>
  <sub>Scan · Audit · Update · Migrate — 9 languages, 23 tools, one MCP server</sub>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/languages-9-34d399"/>
  <img src="https://img.shields.io/badge/tools-23-60a5fa"/>
  <img src="https://img.shields.io/badge/CVE_scanner-live-f59e0b"/>
  <img src="https://img.shields.io/badge/license-MIT-blue"/>
</p>

**DepRadar** is an MCP server that keeps your projects' dependencies up to date, scans for vulnerabilities, detects framework migrations, and audits your entire dev infrastructure — directly from Cursor, Claude, or any MCP-compatible AI assistant.

Supports **Node.js**, **Python**, **Rust**, **Go**, **PHP**, **Ruby**, **Dart/Flutter**, **Swift**, and **Kotlin/Java**.

---

## Why DepRadar?

With AI-generated "vibe coding" projects, dependency maintenance is an afterthought. WordPress solved this with one-click updates. **DepRadar** brings the same experience to modern development — plus security scanning, migration detection, and infrastructure auditing.

---

## Features

### Dependency Management
- **Multi-language**: 9 languages, auto-detected
- **Framework-aware**: SvelteKit, Next.js, Nuxt, Astro, Django, Laravel, Express...
- **Safe updates**: 3 levels (patch/minor/latest) with dry-run preview
- **Batch operations**: Update all projects at once
- **Ecosystem grouping**: Results grouped by Svelte, Supabase, Tailwind, Vite, etc.

### Security & Compliance
- **Live CVE scanning** via [osv.dev](https://osv.dev) API (npm, PyPI, crates.io, Go, PHP, Ruby)
- **Framework CVE database**: Curated advisories for Svelte, Next.js, Vite, Express, Axios
- **Native audit integration**: npm audit, cargo audit, pip-audit, composer audit, govulncheck
- **Secret scanner**: Detects AWS keys, GitHub tokens, Stripe keys, database URLs, and more
- **License compliance**: Flags GPL/AGPL copyleft, non-commercial, and unknown licenses

### Migration & Maintenance
- **Migration detector**: Identifies code patterns that need changing (Svelte 4→5 runes, Next.js Pages→App Router)
- **Changelog preview**: See breaking changes before updating
- **Deprecated detection**: Finds unmaintained packages and suggests replacements
- **Health scores**: 0-100 per project based on deps, security, lockfile, runtime
- **Background checker**: Scheduled scans via macOS launchd or Linux cron

### Infrastructure Audit
- **Runtime versions**: Node.js, Python, Rust, Go, PHP, Ruby, Dart, Swift (EOL detection)
- **Global toolchain**: npm, pnpm, yarn, bun, cargo, pip, git, docker, vercel, supabase, wrangler
- **Docker image audit**: Detects outdated/EOL base images
- **GitHub Actions audit**: Flags deprecated actions across all workflows
- **Environment check**: .env sync, lockfile freshness, config validation

---

## Quick Start

### Option 1: npx (zero install)

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "DepRadar": {
      "command": "npx",
      "args": ["-y", "DepRadar"]
    }
  }
}
```

### Option 2: Global install

```bash
npm install -g DepRadar
```

```json
{
  "mcpServers": {
    "DepRadar": {
      "command": "DepRadar"
    }
  }
}
```

### Option 3: Clone

```bash
git clone https://github.com/Soflution1/DepRadar.git
cd DepRadar && npm install && npm run build
```

```json
{
  "mcpServers": {
    "DepRadar": {
      "command": "node",
      "args": ["/path/to/DepRadar/dist/index.js"]
    }
  }
}
```

Restart Cursor after editing the config.

---

## All 23 Tools

| Tool | Description |
|------|-------------|
| `depradar_scan` | Scan all projects for outdated deps |
| `depradar_check` | Check a specific project |
| `depradar_update` | Update a project's dependencies |
| `depradar_update_all` | Batch update all projects |
| `depradar_health` | Health score 0-100 for a project |
| `depradar_install` | Fresh install with optional clean |
| `depradar_audit` | Security scan (npm/pip/cargo audit) |
| `depradar_cve` | Curated framework CVE advisory check |
| `depradar_live_cve` | Real-time CVE scan via osv.dev API |
| `depradar_changelog` | Changelogs & breaking changes before updating |
| `depradar_migrate` | Framework migration detector |
| `depradar_deprecated` | Deprecated & replaced package detection |
| `depradar_secrets` | Secret & API key scanner |
| `depradar_licenses` | License compliance (GPL/AGPL flags) |
| `depradar_runtimes` | Runtime version check (EOL detection) |
| `depradar_toolchain` | Global tool versions |
| `depradar_docker` | Docker image audit |
| `depradar_actions` | GitHub Actions audit |
| `depradar_envcheck` | .env, lockfile, config validation |
| `depradar_infra` | Full infrastructure report (everything) |
| `depradar_alerts` | Instant alerts from background scans |
| `depradar_setup_checker` | Setup automatic background scanning |
| `depradar_config` | View/edit configuration |

---

## Background Checker

The background checker scans your projects on a schedule and caches results. When you open Cursor, `depradar_alerts` reads the cache instantly — zero wait.

1. A lightweight script runs every N hours via macOS launchd or Linux cron
2. Scans all projects, compares versions with registries
3. Writes results to `~/.depradar-cache.json`, exits immediately
4. Zero RAM between runs, zero AI tokens, zero cost

**Setup from Cursor:** "Setup background checking every 6 hours"

---

## Configuration

Set your projects directory (auto-detected from `~/Cursor/App`, `~/Projects`, `~/Developer`, `~/Code`, `~/dev`):

```json
// ~/.depradarrc.json
{
  "projectsDir": "/Users/me/my-projects"
}
```

Or from Cursor: "Set my projects directory to ~/Code"

---

## Supported Languages

| Language | Detected by | Package Manager |
|----------|------------|-----------------|
| Node.js | `package.json` | npm, pnpm, yarn, bun |
| Python | `requirements.txt`, `pyproject.toml`, `Pipfile` | pip, pipenv, poetry |
| Rust | `Cargo.toml` | cargo |
| Go | `go.mod` | go |
| PHP | `composer.json` | composer |
| Ruby | `Gemfile` | bundler |
| Dart/Flutter | `pubspec.yaml` | pub |
| Swift | `Package.swift` | swift |
| Kotlin/Java | `build.gradle.kts` | gradle |

## Framework Detection

SvelteKit · Next.js · Nuxt · Astro · Remix · SolidStart · Django · Flask · Laravel · Express · Fastify · Hono · Actix · Gin · Fiber

---

## Architecture

```
DepRadar/
├── src/
│   ├── index.ts              # Entry: MCP server or --check mode
│   ├── checker.ts            # Background scanner (cron/launchd)
│   ├── dashboard.ts          # Web dashboard (http://127.0.0.1:24681)
│   ├── constants.ts          # Language markers, ecosystem patterns
│   ├── types.ts              # TypeScript interfaces
│   ├── schemas/index.ts      # Zod input validation
│   ├── services/
│   │   ├── project.ts        # Multi-lang detection, outdated parsing
│   │   ├── formatter.ts      # Reports, tables, alerts formatting
│   │   ├── audit.ts          # Native security audit (npm/cargo/pip)
│   │   ├── cve.ts            # Curated CVE advisory database
│   │   ├── osv.ts            # Live CVE via osv.dev API
│   │   ├── changelog.ts      # Changelog & breaking change detection
│   │   ├── migrate.ts        # Framework migration detector
│   │   ├── deprecated.ts     # Deprecated package detection
│   │   ├── secrets.ts        # Secret & token scanner
│   │   ├── licenses.ts       # License compliance checker
│   │   ├── runtimes.ts       # Runtime version checker
│   │   ├── toolchain.ts      # Global toolchain checker
│   │   ├── docker.ts         # Docker image auditor
│   │   ├── actions.ts        # GitHub Actions auditor
│   │   └── envcheck.ts       # Environment validator
│   └── tools/index.ts        # 23 MCP tools
├── static/
│   ├── logo.png              # DepRadar logo (512x512)
│   └── banner.png            # GitHub banner (1800x600)
├── package.json
├── tsconfig.json
└── LICENSE (MIT)
```

---

## CLI

```bash
DepRadar              # Start MCP server (for Cursor)
DepRadar --check      # Run background scan
DepRadar --version    # Show version
DepRadar --help       # List all 23 tools
```

---

## License

MIT — [Soflution Ltd](https://soflution.com)
