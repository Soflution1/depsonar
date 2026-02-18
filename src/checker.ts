#!/usr/bin/env node

/**
 * depup-checker: Lightweight background scanner
 *
 * Runs via cron/launchd, scans all projects for outdated deps,
 * writes results to ~/.depup-cache.json, and exits.
 *
 * - Zero RAM between runs (process exits)
 * - Zero tokens (no AI API calls)
 * - Zero network except package registry queries (npm outdated, pip list, etc.)
 * - Typically completes in 10-30 seconds
 */

import {
  discoverProjects,
  getOutdated,
  isMajorUpdate,
  getSecurityIssues,
  writeCache,
  getFrameworkVersion,
  loadConfig,
  buildUpdateCommand,
  run,
} from "./services/project.js";
import type { CacheEntry } from "./types.js";

export async function main() {
  const start = Date.now();
  const projects = discoverProjects();

  if (projects.length === 0) {
    console.error("[DepRadar] No projects found. Configure with ~/.depuprc.json");
    process.exit(0);
  }

  console.error(`[DepRadar] Scanning ${projects.length} projects...`);

  const entries: CacheEntry[] = [];

  for (const info of projects) {
    try {
      const outdated = getOutdated(info.path, info);
      const outdatedCount = Object.keys(outdated).length;
      const majorCount = Object.entries(outdated).filter(([, pkg]) =>
        isMajorUpdate(pkg.current, pkg.latest)
      ).length;

      // Simple score without full audit (faster)
      let score = 100;
      score -= Math.min(outdatedCount * 3, 40);
      score -= majorCount * 10;
      score = Math.max(0, Math.min(100, score));

      entries.push({
        project: info.name,
        path: info.path,
        language: info.language,
        framework: info.framework,
        outdatedCount,
        majorCount,
        securityIssues: 0, // skip audit in background (slow)
        score,
        checkedAt: new Date().toISOString(),
      });

      const status = outdatedCount === 0 ? "✅" : `⚠️ ${outdatedCount} outdated`;
      console.error(`  ${info.name}: ${status}`);
    } catch (err) {
      console.error(`  ${info.name}: ❌ error`);
    }
  }

  writeCache(entries);

  // ── Auto-update enabled projects (safe = minor only) ──
  const config = loadConfig() as any;
  const autoList: string[] = config.autoUpdate || [];
  if (autoList.length > 0) {
    const toUpdate = entries.filter(
      (e) => autoList.includes(e.project) && e.outdatedCount > 0
    );
    if (toUpdate.length > 0) {
      console.error(`[DepRadar] Auto-updating ${toUpdate.length} project(s)...`);
      for (const entry of toUpdate) {
        const info = projects.find((p) => p.name === entry.project);
        if (!info) continue;
        try {
          const cmd = buildUpdateCommand(info, undefined, "minor");
          console.error(`  ${entry.project}: $ ${cmd}`);
          run(cmd, info.path);
          console.error(`  ${entry.project}: ✅ updated`);
        } catch (err: any) {
          console.error(`  ${entry.project}: ❌ ${err.message}`);
        }
      }
      // Re-scan updated projects to refresh cache
      console.error(`[DepRadar] Re-scanning auto-updated projects...`);
      for (const entry of toUpdate) {
        const info = projects.find((p) => p.name === entry.project);
        if (!info) continue;
        try {
          const outdated = getOutdated(info.path, info);
          const outdatedCount = Object.keys(outdated).length;
          const majorCount = Object.entries(outdated).filter(([, pkg]) =>
            isMajorUpdate(pkg.current, pkg.latest)
          ).length;
          let score = 100;
          score -= Math.min(outdatedCount * 3, 40);
          score -= majorCount * 10;
          score = Math.max(0, Math.min(100, score));
          const idx = entries.findIndex((e) => e.project === entry.project);
          if (idx >= 0) {
            entries[idx] = { ...entries[idx], outdatedCount, majorCount, score, checkedAt: new Date().toISOString() };
          }
        } catch { /* ignore */ }
      }
      writeCache(entries);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const alerts = entries.filter((e) => e.outdatedCount > 0).length;

  console.error(
    `[DepRadar] Done in ${elapsed}s. ${entries.length} projects, ${alerts} need attention.`
  );
  console.error(`[DepRadar] Cache written to ~/.depup-cache.json`);
}

// Only run if called directly (not imported)
const isDirectRun = process.argv[1]?.endsWith("checker.js") || process.argv.includes("--check");
if (isDirectRun) {
  main().catch((err) => {
    console.error("[DepRadar] Fatal:", err.message);
    process.exit(1);
  });
}
