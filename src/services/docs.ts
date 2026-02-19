/**
 * depsonar docs: fetch up-to-date documentation for any library
 * Sources: npm registry → GitHub repo → README/CHANGELOG/migration guides
 */

interface DocResult {
  package: string;
  version: string;
  description: string;
  repository: string;
  readme: string;
  changelog: string;
  migrationGuide: string;
  homepage: string;
}

interface NpmRegistryData {
  name: string;
  "dist-tags": { latest: string };
  description?: string;
  homepage?: string;
  repository?: { type: string; url: string };
  readme?: string;
}

function extractGitHubRepo(repoUrl: string): { owner: string; repo: string } | null {
  const cleaned = repoUrl
    .replace(/^git\+/, "").replace(/\.git$/, "")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git:\/\/github\.com\//, "https://github.com/");
  const match = cleaned.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function fetchUrl(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "depsonar/4.0", Accept: "text/plain, application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch { clearTimeout(timer); return null; }
}

async function fetchFirstFound(owner: string, repo: string, paths: string[]): Promise<string> {
  // Try all paths in parallel, return first non-empty result
  const results = await Promise.all(
    paths.map(p => fetchUrl(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${p}`))
  );
  for (const r of results) {
    if (r && r.length > 50) return r;
  }
  return "";
}

// Monorepo-aware: package might be in packages/<name>/
function getMonorepoPaths(baseName: string, files: string[]): string[] {
  const paths: string[] = [...files];
  // Also check packages/<name>/<file> and packages/<name>/<file>
  for (const f of files) {
    paths.push(`packages/${baseName}/${f}`);
  }
  return paths;
}

// Known migration/upgrade guide paths per library
const MIGRATION_PATHS: Record<string, string[]> = {
  svelte: [
    "documentation/docs/07-misc/07-v5-migration-guide.md",
    "packages/svelte/CHANGELOG.md",
  ],
  "@sveltejs/kit": [
    "documentation/docs/25-build-and-deploy/99-migration-guide.md",
    "packages/kit/CHANGELOG.md",
  ],
  next: [
    "docs/01-app/02-building-your-application/10-upgrading/01-version-15.mdx",
    "docs/01-app/02-building-your-application/10-upgrading/02-version-14.mdx",
  ],
  tailwindcss: [
    "packages/tailwindcss/CHANGELOG.md",
    "CHANGELOG.md",
  ],
  vite: ["packages/vite/CHANGELOG.md", "CHANGELOG.md"],
  "better-auth": ["CHANGELOG.md"],
  "@supabase/supabase-js": ["CHANGELOG.md"],
  stripe: ["CHANGELOG.md", "UPGRADING.md"],
  react: ["CHANGELOG.md"],
  vue: ["CHANGELOG.md"],
  express: ["History.md"],
};

function truncateDoc(text: string, maxLines = 200): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + `\n\n... (truncated, ${lines.length - maxLines} more lines)`;
}

function filterByQuery(text: string, query?: string, contextLines = 5): string {
  if (!query || !text) return text;
  const lines = text.split("\n");
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matchedLineNums = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (keywords.some(kw => lower.includes(kw))) {
      for (let j = Math.max(0, i - contextLines); j <= Math.min(lines.length - 1, i + contextLines); j++) {
        matchedLineNums.add(j);
      }
    }
  }

  if (matchedLineNums.size === 0) return text; // no matches, return full doc
  const sorted = [...matchedLineNums].sort((a, b) => a - b);
  const result: string[] = [];
  let lastLine = -2;
  for (const n of sorted) {
    if (n > lastLine + 1) result.push("\n...\n");
    result.push(lines[n]);
    lastLine = n;
  }
  return result.join("\n");
}

export async function fetchLibraryDocs(
  pkg: string,
  query?: string,
  opts: { readme?: boolean; changelog?: boolean; migration?: boolean } = {}
): Promise<DocResult> {
  const result: DocResult = {
    package: pkg,
    version: "",
    description: "",
    repository: "",
    readme: "",
    changelog: "",
    migrationGuide: "",
    homepage: "",
  };

  // 1. Fetch npm registry metadata
  const npmData = await fetchUrl(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
  if (!npmData) throw new Error(`Package "${pkg}" not found on npm.`);

  let npmJson: NpmRegistryData;
  try { npmJson = JSON.parse(npmData); } catch { throw new Error(`Invalid npm data for "${pkg}".`); }

  result.version = npmJson["dist-tags"]?.latest || "";
  result.description = npmJson.description || "";
  result.homepage = npmJson.homepage || "";

  // 2. Extract GitHub repo
  const repoUrl = npmJson.repository?.url || "";
  const gh = extractGitHubRepo(repoUrl);
  if (gh) {
    result.repository = `https://github.com/${gh.owner}/${gh.repo}`;
  }

  // 3. Fetch README from npm (usually included) or GitHub
  if (opts.readme !== false) {
    let readme = npmJson.readme || "";
    if ((!readme || readme.length < 100) && gh) {
      readme = await fetchFirstFound(gh.owner, gh.repo, ["README.md", "readme.md", "Readme.md"]) || "";
    }
    if (readme) {
      result.readme = truncateDoc(query ? filterByQuery(readme, query) : readme, 300);
    }
  }

  // 4. Fetch CHANGELOG from GitHub
  if (opts.changelog !== false && gh) {
    const baseName = pkg.startsWith("@") ? pkg.split("/")[1] : pkg;
    const changelogPaths = getMonorepoPaths(baseName, [
      "CHANGELOG.md", "changelog.md", "CHANGES.md", "HISTORY.md", "History.md",
    ]);
    let changelog = await fetchFirstFound(gh.owner, gh.repo, changelogPaths);
    if (changelog) {
      result.changelog = truncateDoc(query ? filterByQuery(changelog, query) : changelog, 200);
    }
  }

  // 5. Fetch migration guide (known paths per library)
  if (opts.migration !== false && gh) {
    const baseName = pkg.startsWith("@") ? pkg.split("/")[1] : pkg;
    const knownPaths = MIGRATION_PATHS[pkg] || MIGRATION_PATHS[baseName];
    if (knownPaths) {
      const guide = await fetchFirstFound(gh.owner, gh.repo, knownPaths);
      if (guide) {
        result.migrationGuide = truncateDoc(query ? filterByQuery(guide, query) : guide, 300);
      }
    }
    // Also try generic migration/upgrade file paths
    if (!result.migrationGuide) {
      const genericPaths = getMonorepoPaths(baseName, [
        "MIGRATION.md", "UPGRADING.md", "UPGRADE.md", "migration.md", "upgrading.md",
        "docs/migration.md", "docs/upgrading.md", "docs/MIGRATION.md",
      ]);
      const guide = await fetchFirstFound(gh.owner, gh.repo, genericPaths);
      if (guide) {
        result.migrationGuide = truncateDoc(query ? filterByQuery(guide, query) : guide, 300);
      }
    }
  }

  return result;
}

export async function searchPackage(query: string): Promise<Array<{ name: string; version: string; description: string }>> {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`;
  const data = await fetchUrl(url);
  if (!data) return [];
  try {
    const json = JSON.parse(data);
    return (json.objects || []).map((o: { package: { name: string; version: string; description?: string } }) => ({
      name: o.package.name,
      version: o.package.version,
      description: o.package.description || "",
    }));
  } catch { return []; }
}
