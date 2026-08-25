import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { getRequiredDocumentsForPaths } from "./docs-audit-rules.mjs";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function resolveComparisonBase() {
  const explicit = String(process.env.DOCS_AUDIT_BASE || "").trim();
  if (explicit) return explicit;

  const baseRef = String(process.env.GITHUB_BASE_REF || "").trim();
  if (baseRef) {
    const remoteRef = `origin/${baseRef}`;
    try {
      return git("merge-base", remoteRef, "HEAD");
    } catch {
      return remoteRef;
    }
  }

  try {
    return git("rev-parse", "HEAD^");
  } catch {
    return git("rev-parse", "HEAD");
  }
}

function getChangedPaths(base) {
  const changed = new Set();
  const committed = git("diff", "--name-only", `${base}..HEAD`);
  for (const path of committed.split("\n").map((value) => value.trim()).filter(Boolean)) changed.add(path);

  // Também considera alterações locais quando o audit é executado fora do CI.
  for (const args of [["diff", "--name-only"], ["diff", "--cached", "--name-only"]]) {
    try {
      const output = git(...args);
      for (const path of output.split("\n").map((value) => value.trim()).filter(Boolean)) changed.add(path);
    } catch {
      // Sem alterações locais é um caso normal.
    }
  }

  return [...changed];
}

function validateDocumentMarkers(document) {
  if (!existsSync(document)) return [`${document}: documento obrigatório não existe`];

  const content = readFileSync(document, "utf8");
  const failures = [];
  const verified = content.match(/<!-- verified-against: ([0-9a-f]{7,40}) -->/i)?.[1];
  const status = content.match(/<!-- docs-status: ([a-z-]+) -->/i)?.[1];

  if (status !== "current") failures.push(`${document}: marcador docs-status ausente ou diferente de current`);
  if (!verified) {
    failures.push(`${document}: marcador verified-against ausente`);
    return failures;
  }

  try {
    git("merge-base", "--is-ancestor", verified, "HEAD");
  } catch {
    failures.push(`${document}: commit de verificação ${verified} não pertence ao histórico atual`);
  }

  return failures;
}

const base = resolveComparisonBase();
const changedPaths = getChangedPaths(base);
const { runtimePaths, documents } = getRequiredDocumentsForPaths(changedPaths);

if (runtimePaths.length === 0) {
  console.log("Documentation Audit: nenhuma mudança de runtime relevante neste diff.");
  process.exit(0);
}

const failures = [];
const changedSet = new Set(changedPaths);

for (const document of documents) {
  failures.push(...validateDocumentMarkers(document));
  if (!changedSet.has(document)) {
    failures.push(`${document}: revisão obrigatória para os domínios alterados, mas o documento não foi atualizado neste diff`);
  }
}

if (failures.length > 0) {
  console.error("Documentação obrigatória não alinhada ao diff de runtime:\n");
  console.error(`Base auditada: ${base}`);
  console.error(`Runtime alterado: ${runtimePaths.join(", ")}\n`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Documentation Audit seletivo: PASS");
console.log(`Base auditada: ${base}`);
console.log(`Runtime alterado: ${runtimePaths.join(", ")}`);
console.log(`Documentos revisados: ${documents.join(", ")}`);
