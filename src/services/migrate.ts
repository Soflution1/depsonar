import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── Framework Migration Detector ──────────────────────────────────────
// Detects when a project should migrate to a new major version
// and identifies code patterns that need changing.

export interface MigrationIssue {
  type: "breaking" | "deprecated" | "recommended";
  pattern: string;
  file: string;
  line: number;
  message: string;
  migration: string; // What to migrate to
}

export interface MigrationResult {
  project: string;
  framework: string;
  currentVersion: string;
  latestMajor: string | null;
  migrationNeeded: boolean;
  issues: MigrationIssue[];
  migrationGuideUrl: string | null;
}

// ─── Migration Rules Database ──────────────────────────────────────────

interface MigrationRule {
  framework: string;
  fromMajor: number;
  toMajor: number;
  patterns: Array<{
    regex: RegExp;
    fileExtensions: string[];
    type: MigrationIssue["type"];
    message: string;
    migration: string;
  }>;
  guideUrl: string;
}

const MIGRATION_RULES: MigrationRule[] = [
  {
    framework: "svelte",
    fromMajor: 4,
    toMajor: 5,
    guideUrl: "https://svelte.dev/docs/svelte/v5-migration-guide",
    patterns: [
      { regex: /export\s+let\s+/g, fileExtensions: [".svelte"], type: "breaking",
        message: "`export let` props are replaced by `$props()` rune",
        migration: "Use `let { prop } = $props()` instead" },
      { regex: /\$:\s+/g, fileExtensions: [".svelte"], type: "breaking",
        message: "Reactive `$:` statements replaced by `$derived()` and `$effect()`",
        migration: "Use `const x = $derived(...)` for derivations, `$effect(() => {...})` for side effects" },
      { regex: /createEventDispatcher/g, fileExtensions: [".svelte", ".ts", ".js"], type: "breaking",
        message: "`createEventDispatcher` replaced by callback props",
        migration: "Pass callback functions as props instead" },
      { regex: /on:click|on:submit|on:change|on:input|on:keydown/g, fileExtensions: [".svelte"], type: "breaking",
        message: "`on:event` syntax replaced by `onevent` props",
        migration: "Use `onclick`, `onsubmit`, `onchange` etc." },
      { regex: /<slot\s*\/?>|<slot\s+name=/g, fileExtensions: [".svelte"], type: "breaking",
        message: "`<slot>` replaced by `{@render}` blocks and `{#snippet}`",
        migration: "Use `{@render children()}` and `{#snippet name()}...{/snippet}`" },
      { regex: /svelte-preprocess/g, fileExtensions: [".ts", ".js", ".json"], type: "deprecated",
        message: "`svelte-preprocess` not needed with Svelte 5",
        migration: "Remove from config, Svelte 5 handles preprocessing natively" },
      { regex: /afterUpdate|beforeUpdate/g, fileExtensions: [".svelte", ".ts", ".js"], type: "breaking",
        message: "`beforeUpdate/afterUpdate` lifecycle hooks removed",
        migration: "Use `$effect.pre()` for beforeUpdate, `$effect()` for afterUpdate" },
      { regex: /\$\$props|\$\$restProps/g, fileExtensions: [".svelte"], type: "breaking",
        message: "`$$props` and `$$restProps` replaced",
        migration: "Use `let { ...rest } = $props()` for rest props" },
    ],
  },
  {
    framework: "next",
    fromMajor: 13,
    toMajor: 14,
    guideUrl: "https://nextjs.org/docs/app/building-your-application/upgrading/version-14",
    patterns: [
      { regex: /next\/image/g, fileExtensions: [".tsx", ".jsx", ".ts", ".js"], type: "recommended",
        message: "Check Image component API changes",
        migration: "Review `next/image` props for v14 changes" },
    ],
  },
  {
    framework: "next",
    fromMajor: 14,
    toMajor: 15,
    guideUrl: "https://nextjs.org/docs/app/building-your-application/upgrading/version-15",
    patterns: [
      { regex: /getServerSideProps|getStaticProps/g, fileExtensions: [".tsx", ".jsx", ".ts", ".js"], type: "deprecated",
        message: "Pages Router data fetching is legacy",
        migration: "Migrate to App Router with server components" },
    ],
  },
];

// ─── Scanning Logic ────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svelte-kit", ".next", ".nuxt", "dist", "build",
  ".vercel", ".cache", "vendor", "target", "__pycache__",
]);

function walkFiles(dir: string, extensions: string[], maxDepth = 5, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkFiles(full, extensions, maxDepth, depth + 1));
      } else if (extensions.includes(extname(entry.name))) {
        files.push(full);
      }
    }
  } catch {}
  return files;
}

function getFrameworkMajor(projectPath: string, framework: string): number | null {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    const fwPackages: Record<string, string> = {
      svelte: "svelte",
      sveltekit: "svelte",
      "next.js": "next",
      nuxt: "nuxt",
      astro: "astro",
    };

    const pkgName = fwPackages[framework.toLowerCase()] || framework.toLowerCase();
    const spec = allDeps[pkgName];
    if (!spec) return null;

    // Try installed version first
    const nmPkg = join(projectPath, "node_modules", pkgName, "package.json");
    if (existsSync(nmPkg)) {
      const nm = JSON.parse(readFileSync(nmPkg, "utf-8"));
      return parseInt(nm.version.split(".")[0], 10);
    }

    // Fallback to specifier
    const ver = String(spec).replace(/^[\^~>=<]+/, "");
    return parseInt(ver.split(".")[0], 10);
  } catch {
    return null;
  }
}

export function detectMigration(projectPath: string, projectName: string, framework: string): MigrationResult {
  const currentMajor = getFrameworkMajor(projectPath, framework);

  const result: MigrationResult = {
    project: projectName,
    framework,
    currentVersion: currentMajor ? `${currentMajor}.x` : "unknown",
    latestMajor: null,
    migrationNeeded: false,
    issues: [],
    migrationGuideUrl: null,
  };

  if (!currentMajor) return result;

  // Find applicable migration rules
  const rules = MIGRATION_RULES.filter(r =>
    r.framework.toLowerCase() === framework.toLowerCase().replace("sveltekit", "svelte").replace("next.js", "next")
    && r.fromMajor === currentMajor
  );

  if (rules.length === 0) return result;

  const rule = rules[0];
  result.latestMajor = `${rule.toMajor}.x`;
  result.migrationGuideUrl = rule.guideUrl;

  // Scan files for migration patterns
  for (const pattern of rule.patterns) {
    const files = walkFiles(projectPath, pattern.fileExtensions);

    for (const file of files) {
      try {
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          pattern.regex.lastIndex = 0;
          if (pattern.regex.test(lines[i])) {
            result.issues.push({
              type: pattern.type,
              pattern: pattern.regex.source,
              file: file.replace(projectPath + "/", ""),
              line: i + 1,
              message: pattern.message,
              migration: pattern.migration,
            });
          }
        }
      } catch {}
    }
  }

  result.migrationNeeded = result.issues.length > 0;
  return result;
}

export function detectAllMigrations(
  projects: Array<{ name: string; path: string; framework: string }>
): MigrationResult[] {
  return projects
    .map(p => detectMigration(p.path, p.name, p.framework))
    .filter(r => r.migrationNeeded);
}
