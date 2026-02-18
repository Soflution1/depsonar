import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Changelog & Breaking Change Detector ──────────────────────────────

export interface ChangelogEntry {
  package: string;
  currentVersion: string;
  latestVersion: string;
  hasBreakingChanges: boolean;
  changelogUrl: string | null;
  releaseNotes: string | null;
  updateType: "patch" | "minor" | "major";
}

export interface ChangelogResult {
  project: string;
  entries: ChangelogEntry[];
}

function getUpdateType(current: string, latest: string): "patch" | "minor" | "major" {
  const c = current.split(".").map(Number);
  const l = latest.split(".").map(Number);
  if ((l[0] || 0) > (c[0] || 0)) return "major";
  if ((l[1] || 0) > (c[1] || 0)) return "minor";
  return "patch";
}

function cmd(command: string, cwd: string, timeout = 10000): string | null {
  try {
    return execSync(command, { encoding: "utf-8", timeout, cwd, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e: any) {
    return e.stdout?.toString()?.trim() || null;
  }
}

function getChangelogUrl(packageName: string): string | null {
  // Try npm view to get repository URL
  const info = cmd(`npm view ${packageName} repository.url homepage --json`, "/tmp", 8000);
  if (!info) return null;

  try {
    const parsed = JSON.parse(info);
    const repoUrl = Array.isArray(parsed) ? parsed[0] : parsed;
    if (typeof repoUrl === "string") {
      const clean = repoUrl.replace(/^git\+/, "").replace(/\.git$/, "").replace("git://", "https://");
      if (clean.includes("github.com")) return `${clean}/blob/main/CHANGELOG.md`;
      return clean;
    }
  } catch {}

  return `https://www.npmjs.com/package/${packageName}?activeTab=versions`;
}

function getReleaseNotes(packageName: string, version: string): string | null {
  // Get abbreviated release info from npm
  const info = cmd(`npm view ${packageName}@${version} description deprecated --json`, "/tmp", 8000);
  if (!info) return null;

  try {
    const parsed = JSON.parse(info);
    if (parsed.deprecated) return `⚠️ DEPRECATED: ${parsed.deprecated}`;
    return typeof parsed === "string" ? parsed : parsed.description || null;
  } catch {
    return info.length < 500 ? info : null;
  }
}

export function getProjectChangelog(projectPath: string, projectName: string): ChangelogResult {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) return { project: projectName, entries: [] };

  // Get outdated packages
  const outdatedRaw = cmd("npm outdated --json", projectPath, 30000);
  if (!outdatedRaw) return { project: projectName, entries: [] };

  let outdated: Record<string, { current: string; wanted: string; latest: string }>;
  try {
    outdated = JSON.parse(outdatedRaw);
  } catch {
    return { project: projectName, entries: [] };
  }

  const entries: ChangelogEntry[] = [];

  for (const [name, info] of Object.entries(outdated)) {
    if (!info.current || !info.latest || info.current === info.latest) continue;

    const updateType = getUpdateType(info.current, info.latest);
    const hasBreaking = updateType === "major";

    entries.push({
      package: name,
      currentVersion: info.current,
      latestVersion: info.latest,
      hasBreakingChanges: hasBreaking,
      changelogUrl: getChangelogUrl(name),
      releaseNotes: hasBreaking ? getReleaseNotes(name, info.latest) : null,
      updateType,
    });
  }

  // Sort: major first, then minor, then patch
  entries.sort((a, b) => {
    const order = { major: 0, minor: 1, patch: 2 };
    return order[a.updateType] - order[b.updateType];
  });

  return { project: projectName, entries };
}
