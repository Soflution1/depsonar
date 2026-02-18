#!/usr/bin/env node

import { SERVER_NAME, SERVER_VERSION } from "./constants.js";

const args = process.argv.slice(2);

if (args.includes("--check") || args.includes("-c")) {
  // Background checker mode: scan, write cache, exit
  // Dynamic import to keep the MCP server startup lean
  const { main } = await import("./checker.js");
} else if (args.includes("--version") || args.includes("-v")) {
  console.log(`${SERVER_NAME} v${SERVER_VERSION}`);
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`${SERVER_NAME} v${SERVER_VERSION}

Usage:
  DepRadar              Start MCP server (for Cursor/Claude)
  DepRadar --check      Run background scan (for cron/launchd)
  DepRadar --version    Show version
  DepRadar --help       Show this help

MCP Tools:
  depradar_alerts           Show pending alerts from background scans
  depradar_scan             Scan all projects for outdated deps
  depradar_check            Check a specific project
  depradar_update           Update a project's dependencies
  depradar_update_all       Batch update all projects
  depradar_health           Health score for a project
  depradar_install          Fresh install dependencies
  depradar_audit            Security vulnerability scan (npm/pip/cargo audit)
  depradar_cve              Known framework CVE advisory check
  depradar_live_cve         Real-time CVE scan via osv.dev API
  depradar_changelog        Changelogs & breaking changes before updating
  depradar_migrate          Framework migration detector (Svelte 4→5, etc.)
  depradar_deprecated       Deprecated & replaced package detection
  depradar_secrets          Secret & API key scanner
  depradar_licenses         License compliance check (GPL/AGPL flags)
  depradar_runtimes         Check runtime versions (Node, Python, Rust...)
  depradar_toolchain        Check global tool versions (npm, pnpm, git...)
  depradar_docker           Audit Docker images for outdated/EOL
  depradar_actions          Audit GitHub Actions versions
  depradar_envcheck         Validate .env, lockfiles, configs
  depradar_infra            Full infrastructure report (everything)
  depradar_setup_checker    Setup automatic background scanning
  depradar_config           View/edit configuration

Supported: Node.js, Python, Rust, Go, PHP, Ruby, Dart/Flutter, Swift, Kotlin/Java
Frameworks: SvelteKit, React, Next.js, Solid.js, Vue/Nuxt, Astro, Django, Laravel, Express
`);
} else {
  // Default: MCP server mode
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { registerTools } = await import("./tools/index.js");

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}
