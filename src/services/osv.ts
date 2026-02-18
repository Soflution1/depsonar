import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Live CVE Fetcher via osv.dev API ──────────────────────────────────
// Free, no auth, covers npm/PyPI/crates.io/Go/Packagist/RubyGems

export interface OsvVulnerability {
  id: string;
  summary: string;
  severity: "critical" | "high" | "moderate" | "low";
  package: string;
  ecosystem: string;
  affectedRange: string;
  fixedVersion: string | null;
  url: string;
  published: string;
}

export interface LiveCveResult {
  project: string;
  vulnerabilities: OsvVulnerability[];
  packagesQueried: number;
  source: "osv.dev";
  queriedAt: string;
}

const ECOSYSTEM_MAP: Record<string, string> = {
  node: "npm",
  python: "PyPI",
  rust: "crates.io",
  go: "Go",
  php: "Packagist",
  ruby: "RubyGems",
  dart: "Pub",
};

function getInstalledPackages(projectPath: string, language: string): Array<{ name: string; version: string }> {
  const packages: Array<{ name: string; version: string }> = [];

  if (language === "node") {
    const pkgPath = join(projectPath, "package.json");
    if (!existsSync(pkgPath)) return [];
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name, spec] of Object.entries(allDeps)) {
        const nmPkg = join(projectPath, "node_modules", name, "package.json");
        if (existsSync(nmPkg)) {
          try {
            const nm = JSON.parse(readFileSync(nmPkg, "utf-8"));
            packages.push({ name, version: nm.version });
          } catch {
            packages.push({ name, version: String(spec).replace(/^[\^~>=<]+/, "") });
          }
        } else {
          packages.push({ name, version: String(spec).replace(/^[\^~>=<]+/, "") });
        }
      }
    } catch {}
  }

  if (language === "rust") {
    const lockPath = join(projectPath, "Cargo.lock");
    if (existsSync(lockPath)) {
      const content = readFileSync(lockPath, "utf-8");
      const regex = /\[\[package\]\]\nname = "(.+?)"\nversion = "(.+?)"/g;
      let match;
      while ((match = regex.exec(content))) {
        packages.push({ name: match[1], version: match[2] });
      }
    }
  }

  if (language === "python") {
    const reqPath = join(projectPath, "requirements.txt");
    if (existsSync(reqPath)) {
      const lines = readFileSync(reqPath, "utf-8").split("\n");
      for (const line of lines) {
        const m = line.trim().match(/^([a-zA-Z0-9_-]+)==(.+)/);
        if (m) packages.push({ name: m[1], version: m[2] });
      }
    }
  }

  if (language === "go") {
    const sumPath = join(projectPath, "go.sum");
    if (existsSync(sumPath)) {
      const seen = new Set<string>();
      const lines = readFileSync(sumPath, "utf-8").split("\n");
      for (const line of lines) {
        const m = line.match(/^(\S+)\s+v(\S+)/);
        if (m && !seen.has(m[1])) {
          seen.add(m[1]);
          packages.push({ name: m[1], version: m[2].replace(/\/go\.mod$/, "") });
        }
      }
    }
  }

  return packages;
}

function mapSeverity(score?: number): OsvVulnerability["severity"] {
  if (!score) return "moderate";
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "moderate";
  return "low";
}

export async function queryOsv(
  packages: Array<{ name: string; version: string }>,
  ecosystem: string
): Promise<OsvVulnerability[]> {
  const vulns: OsvVulnerability[] = [];

  // OSV querybatch endpoint (max 1000 per request)
  const queries = packages.map(p => ({
    package: { name: p.name, ecosystem },
    version: p.version,
  }));

  // Batch in groups of 100
  for (let i = 0; i < queries.length; i += 100) {
    const batch = queries.slice(i, i + 100);
    try {
      const resp = await fetch("https://api.osv.dev/v1/querybatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: batch }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) continue;
      const data = await resp.json() as { results: Array<{ vulns?: any[] }> };

      for (let j = 0; j < data.results.length; j++) {
        const result = data.results[j];
        if (!result.vulns?.length) continue;

        const pkg = packages[i + j];
        for (const vuln of result.vulns) {
          const cvssScore = vuln.severity?.[0]?.score;
          const affected = vuln.affected?.[0];
          const fixedRange = affected?.ranges?.[0]?.events?.find((e: any) => e.fixed);

          vulns.push({
            id: vuln.id,
            summary: vuln.summary || vuln.details?.slice(0, 200) || "No description",
            severity: mapSeverity(cvssScore),
            package: pkg.name,
            ecosystem,
            affectedRange: `${pkg.version} (installed)`,
            fixedVersion: fixedRange?.fixed || null,
            url: vuln.references?.[0]?.url || `https://osv.dev/vulnerability/${vuln.id}`,
            published: vuln.published || "",
          });
        }
      }
    } catch {
      // Network error, skip this batch
    }
  }

  return vulns;
}

export async function liveAuditProject(
  projectPath: string,
  projectName: string,
  language: string
): Promise<LiveCveResult> {
  const ecosystem = ECOSYSTEM_MAP[language];
  if (!ecosystem) {
    return { project: projectName, vulnerabilities: [], packagesQueried: 0, source: "osv.dev", queriedAt: new Date().toISOString() };
  }

  const packages = getInstalledPackages(projectPath, language);
  const vulns = await queryOsv(packages, ecosystem);

  return {
    project: projectName,
    vulnerabilities: vulns,
    packagesQueried: packages.length,
    source: "osv.dev",
    queriedAt: new Date().toISOString(),
  };
}

export async function liveAuditAllProjects(
  projects: Array<{ name: string; path: string; language: string }>
): Promise<LiveCveResult[]> {
  const results: LiveCveResult[] = [];
  for (const p of projects) {
    const result = await liveAuditProject(p.path, p.name, p.language);
    if (result.vulnerabilities.length > 0) results.push(result);
  }
  return results;
}
