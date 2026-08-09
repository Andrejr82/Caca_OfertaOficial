import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const canonicalDocuments = [
  "README.md",
  "docs/CURRENT_SYSTEM_STATUS.md",
  "docs/architecture-current.md",
  "docs/configuration.md",
  "docs/integracoes.md",
  "docs/deployment.md",
  "docs/SECURITY.md",
  "docs/troubleshooting.md",
];

const runtimePaths = [
  "src",
  "scripts",
  "supabase",
  "apps",
  ".env.example",
  "package.json",
  "next.config.ts",
  "vercel.json",
];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const failures = [];

for (const document of canonicalDocuments) {
  const content = readFileSync(document, "utf8");
  const verified = content.match(/<!-- verified-against: ([0-9a-f]{7,40}) -->/i)?.[1];
  const status = content.match(/<!-- docs-status: ([a-z-]+) -->/i)?.[1];

  if (status !== "current") {
    failures.push(`${document}: marcador docs-status ausente ou diferente de current`);
  }

  if (!verified) {
    failures.push(`${document}: marcador verified-against ausente`);
    continue;
  }

  try {
    git("merge-base", "--is-ancestor", verified, "HEAD");
  } catch {
    failures.push(`${document}: commit de verificacao ${verified} nao pertence ao historico atual`);
    continue;
  }

  let documentChangedLocally = false;
  try {
    git("diff", "--quiet", "--", document);
  } catch {
    documentChangedLocally = true;
  }

  if (documentChangedLocally) continue;

  const documentCommit = git("log", "-1", "--format=%H", "--", document);
  const changes = git("rev-list", "--count", `${documentCommit}..HEAD`, "--", ...runtimePaths);
  if (Number(changes) > 0) {
    failures.push(`${document}: ${changes} commit(s) de runtime desde sua ultima atualizacao`);
  }
}

if (failures.length > 0) {
  console.error("Documentacao possivelmente desatualizada:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Documentacao canonica alinhada ao runtime versionado.");
