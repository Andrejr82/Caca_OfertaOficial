import test from "node:test";
import assert from "node:assert/strict";
import { getRequiredDocumentsForPaths, isRuntimePath } from "../docs-audit-rules.mjs";

function docsFor(...paths) {
  return getRequiredDocumentsForPaths(paths).documents;
}

test("ignora testes como runtime", () => {
  assert.equal(isRuntimePath("src/tests/example.test.ts"), false);
  assert.equal(isRuntimePath("scripts/tests/example.test.cjs"), false);
});

test("Oracle exige docs operacionais específicos", () => {
  assert.deepEqual(docsFor("scripts/oracle-scraper.cjs"), [
    "docs/CURRENT_SYSTEM_STATUS.md",
    "docs/deployment.md",
    "docs/oracle-scripts-runbook.md",
    "docs/oracle.md",
  ]);
});

test("WhatsApp exige integrações e troubleshooting, sem Top30 genérico", () => {
  assert.deepEqual(docsFor("src/lib/offers/whatsapp-dashboard-loader.ts"), [
    "docs/integracoes.md",
    "docs/troubleshooting.md",
  ]);
});

test("Instagram exige segurança além de integração", () => {
  assert.deepEqual(docsFor("src/app/api/instagram/publish/route.ts"), [
    "docs/SECURITY.md",
    "docs/integracoes.md",
    "docs/troubleshooting.md",
  ]);
});

test("cenários e marketplaces exigem estado, arquitetura e integrações", () => {
  assert.deepEqual(docsFor("scripts/commercial-niche-config.cjs"), [
    "docs/CURRENT_SYSTEM_STATUS.md",
    "docs/architecture-current.md",
    "docs/configuration.md",
    "docs/integracoes.md",
  ]);
});

test("runtime não classificado usa fallback seguro para estado atual", () => {
  assert.deepEqual(docsFor("src/lib/example/new-runtime.ts"), ["docs/CURRENT_SYSTEM_STATUS.md"]);
});

test("mudança estrutural exige README apenas quando apropriado", () => {
  assert.deepEqual(docsFor("package.json"), [
    "README.md",
    "docs/CURRENT_SYSTEM_STATUS.md",
    "docs/configuration.md",
  ]);
});

test("ferramenta do Documentation Audit exige governança, não todos os docs", () => {
  assert.deepEqual(docsFor("scripts/docs-audit.mjs"), ["docs/DOCUMENTATION_GOVERNANCE.md"]);
});

test("workflow do próprio audit não exige documentação de deploy", () => {
  assert.deepEqual(docsFor(".github/workflows/docs-audit.yml"), ["docs/DOCUMENTATION_GOVERNANCE.md"]);
});

test("une domínios sem duplicar documentos", () => {
  assert.deepEqual(docsFor(
    "scripts/oracle-scraper.cjs",
    "src/lib/offers/whatsapp-dashboard-loader.ts",
  ), [
    "docs/CURRENT_SYSTEM_STATUS.md",
    "docs/deployment.md",
    "docs/integracoes.md",
    "docs/oracle-scripts-runbook.md",
    "docs/oracle.md",
    "docs/troubleshooting.md",
  ]);
});
