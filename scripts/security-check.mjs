import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([".git", ".next", "node_modules", "__pycache__", "coverage", "dist", "out"]);
const allowedFiles = new Set([".env.example", "docs/SECURITY.md", "harness/security-checklist.md"]);
const riskyPatterns = [
  { name: "OpenAI-style key", regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "Assigned Telegram token", regex: /TELEGRAM_BOT_TOKEN[ \t]*=[ \t]*["']?[^"'\s#]+/ },
  { name: "Assigned service role key", regex: /SUPABASE_SERVICE_ROLE_KEY[ \t]*=[ \t]*["']?[^"'\s#]+/ },
  { name: "Assigned password", regex: /password\s*=\s*["'][^"']+["']/i },
  { name: "Assigned secret", regex: /secret\s*=\s*["'][^"']+["']/i }
];

const failures = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }
    const rel = relative(root, fullPath).replaceAll("\\", "/");
    if (!/\.(ts|tsx|js|mjs|json|md|sql|example|env|yml|yaml)$/.test(rel) && rel !== ".gitignore") continue;
    scanFile(rel, fullPath);
  }
}

function scanFile(rel, fullPath) {
  const content = readFileSync(fullPath, "utf8");

  if ((rel === ".env" || rel.endsWith(".env.local")) && !allowedFiles.has(rel)) {
    failures.push(`${rel}: env file should not be versioned`);
  }

  if (rel.includes("src/") && rel.includes("components") && /SUPABASE_SERVICE_ROLE_KEY/.test(content)) {
    failures.push(`${rel}: service role key referenced in component code`);
  }

  for (const pattern of riskyPatterns) {
    if (allowedFiles.has(rel)) continue;
    if (rel === ".env.example") continue;
    if (pattern.regex.test(content)) failures.push(`${rel}: ${pattern.name}`);
  }
}

walk(root);

const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
for (const required of [".env", ".env.*", "!.env.example"]) {
  if (!gitignore.includes(required)) failures.push(`.gitignore: missing ${required}`);
}

const schema = readFileSync(join(root, "supabase/schema.sql"), "utf8");
for (const table of ["profiles", "offers", "affiliate_links", "posts", "sales", "integration_logs", "app_settings"]) {
  if (!schema.includes(`alter table public.${table} enable row level security`)) {
    failures.push(`supabase/schema.sql: missing RLS for ${table}`);
  }
}

if (failures.length) {
  console.error("Security check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("security_check_ok");
