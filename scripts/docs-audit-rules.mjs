const RUNTIME_PREFIXES = ["src/", "scripts/", "supabase/", "apps/"];
const RUNTIME_FILES = new Set([".env.example", "package.json", "next.config.ts", "vercel.json"]);
const DOCS_AUDIT_WORKFLOW = ".github/workflows/docs-audit.yml";

function normalizePath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isRuntimePath(path) {
  const normalized = normalizePath(path);
  if (normalized.startsWith("src/tests/") || normalized.startsWith("scripts/tests/")) return false;
  return RUNTIME_FILES.has(normalized) || RUNTIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const DOMAIN_RULES = [
  {
    name: "documentation-governance",
    matches: (path) => [
      "scripts/docs-audit.mjs",
      "scripts/docs-audit-rules.mjs",
      DOCS_AUDIT_WORKFLOW,
    ].includes(path) || path.startsWith("scripts/tests/docs-audit"),
    documents: ["docs/DOCUMENTATION_GOVERNANCE.md"],
  },
  {
    name: "oracle",
    matches: (path) => path.startsWith("apps/oracle-")
      || /^scripts\/.*oracle.*\.(?:cjs|mjs|js|ts|ps1)$/i.test(path),
    documents: [
      "docs/oracle.md",
      "docs/oracle-scripts-runbook.md",
      "docs/deployment.md",
      "docs/CURRENT_SYSTEM_STATUS.md",
    ],
  },
  {
    name: "whatsapp",
    matches: (path) => /whatsapp/i.test(path),
    documents: ["docs/integracoes.md", "docs/troubleshooting.md"],
  },
  {
    name: "instagram-meta",
    matches: (path) => /(instagram|facebook|meta)/i.test(path),
    documents: ["docs/integracoes.md", "docs/SECURITY.md", "docs/troubleshooting.md"],
  },
  {
    name: "telegram",
    matches: (path) => /telegram/i.test(path),
    documents: ["docs/integracoes.md", "docs/troubleshooting.md"],
  },
  {
    name: "marketplaces-niches-editorial",
    matches: (path) => /(commercial-niche|scenario|editorial|shopee|amazon|mercadolivre|mercado-livre|marketplace)/i.test(path),
    documents: ["docs/CURRENT_SYSTEM_STATUS.md", "docs/architecture-current.md", "docs/integracoes.md"],
  },
  {
    name: "database-storage",
    matches: (path) => path.startsWith("supabase/") || /(supabase|storage|rls)/i.test(path),
    documents: ["docs/architecture-current.md", "docs/SECURITY.md"],
  },
  {
    name: "security-auth",
    matches: (path) => /(security|auth|session|middleware|proxy)/i.test(path),
    documents: ["docs/SECURITY.md", "docs/troubleshooting.md"],
  },
  {
    name: "configuration",
    matches: (path) => RUNTIME_FILES.has(path)
      || path.startsWith("src/config/")
      || /(?:^|\/).*config(?:uration)?[^/]*\.(?:ts|js|cjs|mjs|json)$/i.test(path),
    documents: ["docs/configuration.md"],
  },
  {
    name: "deployment",
    matches: (path) => path === "vercel.json"
      || (path.startsWith(".github/workflows/") && path !== DOCS_AUDIT_WORKFLOW),
    documents: ["docs/deployment.md"],
  },
  {
    name: "repository-foundation",
    matches: (path) => ["package.json", "next.config.ts", "vercel.json"].includes(path),
    documents: ["README.md", "docs/CURRENT_SYSTEM_STATUS.md"],
  },
];

export function getDocumentationDomainsForPath(path) {
  const normalized = normalizePath(path);
  if (!isRuntimePath(normalized) && !normalized.startsWith(".github/workflows/")) return [];
  return DOMAIN_RULES.filter((rule) => rule.matches(normalized)).map((rule) => rule.name);
}

export function getRequiredDocumentsForPaths(paths) {
  const required = new Set();
  const matchedRuntimePaths = [];

  for (const rawPath of paths || []) {
    const path = normalizePath(rawPath);
    const governanceTooling = DOMAIN_RULES[0].matches(path);
    if (!isRuntimePath(path) && !governanceTooling) continue;

    matchedRuntimePaths.push(path);
    let matched = false;
    for (const rule of DOMAIN_RULES) {
      if (!rule.matches(path)) continue;
      matched = true;
      for (const document of rule.documents) required.add(document);
    }

    // Fallback seguro: runtime desconhecido ainda exige revisão do estado atual.
    if (!matched) required.add("docs/CURRENT_SYSTEM_STATUS.md");
  }

  return {
    runtimePaths: matchedRuntimePaths,
    documents: [...required].sort(),
  };
}

export { DOMAIN_RULES };
