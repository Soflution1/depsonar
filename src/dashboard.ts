#!/usr/bin/env node
/**
 * DepRadar dashboard v2: Full dependency management interface
 * http://127.0.0.1:24681
 */
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main as runChecker } from "./checker.js";
import {
  discoverProjects, getOutdated, isMajorUpdate,
  groupByEcosystem, buildUpdateCommand, getSecurityIssues,
  computeHealthReport, run, loadConfig, saveConfig,
} from "./services/project.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 24681;
const CACHE_PATH = join(homedir(), ".depradar-cache.json");

function readCache() {
  if (!existsSync(CACHE_PATH)) return null;
  try { return JSON.parse(readFileSync(CACHE_PATH, "utf-8")); } catch { return null; }
}

function jsonRes(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c: Buffer) => { body += c.toString(); });
    req.on("end", () => resolve(body));
  });
}

let scanning = false;
let htmlCache: string | null = null;

function getHtml(): string {
  if (htmlCache) return htmlCache;
  const htmlPath = join(__dirname, "..", "dashboard.html");
  if (existsSync(htmlPath)) {
    htmlCache = readFileSync(htmlPath, "utf-8");
    return htmlCache;
  }
  return "<h1>dashboard.html not found</h1>";
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // API: Overview
  if (url === "/api/status") {
    const cache = readCache();
    if (!cache) return jsonRes(res, { projects: [], updatedAt: null, scanning });
    return jsonRes(res, { ...cache, scanning });
  }

  // API: Project detail (live scan)
  if (url.startsWith("/api/project/")) {
    const projectName = decodeURIComponent(url.replace("/api/project/", "").split("?")[0]);
    const projects = discoverProjects();
    const info = projects.find(p => p.name === projectName);
    if (!info) return jsonRes(res, { error: "Project not found" }, 404);

    try {
      const outdated = getOutdated(info.path, info);
      const grouped = groupByEcosystem(outdated);
      const security = getSecurityIssues(info.path, info);
      const health = computeHealthReport(info);

      const enrichedGroups: Record<string, any[]> = {};
      for (const [ecosystem, items] of Object.entries(grouped)) {
        enrichedGroups[ecosystem] = items.map(([name, pkg]) => ({
          name,
          ...pkg,
          updateType: isMajorUpdate(pkg.current, pkg.latest) ? "major"
            : pkg.current !== pkg.wanted ? "minor" : "patch",
        }));
      }

      return jsonRes(res, {
        project: info.name, path: info.path,
        language: info.language, framework: info.framework,
        packageManager: info.packageManager,
        outdatedCount: Object.keys(outdated).length,
        majorCount: Object.values(outdated).filter(p => isMajorUpdate(p.current, p.latest)).length,
        securityIssues: security, health, groups: enrichedGroups,
        updateCommands: {
          safe: buildUpdateCommand(info, undefined, "minor"),
          latest: buildUpdateCommand(info, undefined, "latest"),
        },
      });
    } catch (err: any) {
      return jsonRes(res, { error: err.message }, 500);
    }
  }

  // API: Trigger background scan
  if (url === "/api/scan" && req.method === "POST") {
    if (scanning) return jsonRes(res, { error: "Scan already in progress" }, 409);
    scanning = true;
    jsonRes(res, { started: true });
    try { await runChecker(); } catch (e) { console.error("[dashboard] Scan error:", e); }
    scanning = false;
    return;
  }

  // API: Update dependencies
  if (url === "/api/update" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const { project, packages, level = "minor", dryRun = false } = body;
    const projects = discoverProjects();
    const info = projects.find(p => p.name === project);
    if (!info) return jsonRes(res, { error: "Project not found" }, 404);

    const cmd = buildUpdateCommand(info, packages, level);
    if (dryRun) return jsonRes(res, { command: cmd, dryRun: true });

    try {
      const output = run(cmd, info.path);
      return jsonRes(res, { command: cmd, output, success: true });
    } catch (err: any) {
      return jsonRes(res, { command: cmd, error: err.message, success: false });
    }
  }

  // API: Get auto-update config
  if (url === "/api/autoupdate" && req.method === "GET") {
    const config = loadConfig() as any;
    return jsonRes(res, { autoUpdate: config.autoUpdate || [] });
  }

  // API: Toggle auto-update for a project
  if (url === "/api/autoupdate" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const { project, enabled } = body;
    const config = loadConfig() as any;
    const list: string[] = config.autoUpdate || [];
    if (enabled && !list.includes(project)) {
      list.push(project);
    } else if (!enabled) {
      const idx = list.indexOf(project);
      if (idx >= 0) list.splice(idx, 1);
    }
    saveConfig({ autoUpdate: list });
    return jsonRes(res, { autoUpdate: list });
  }

  // Serve HTML
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getHtml());
}

const server = createServer(handleRequest);
server.listen(PORT, "127.0.0.1", () => {
  console.error("[DepRadar] Dashboard v2 running on http://127.0.0.1:" + PORT);
});
