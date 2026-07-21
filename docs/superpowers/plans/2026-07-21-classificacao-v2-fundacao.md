# Classificação V2 — Fundação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a fundação determinística e auditável que classifica ofertas, impede comparações erradas e prepara grupos seguros antes da curadoria humana.

**Architecture:** A coleta permanece inalterada nesta fase. Itens brutos serão preservados em `discovery_items`; uma classificação determinística, sem LLM, grava atributos normalizados e status de revisão. O agrupamento cria grupos `exact` apenas quando marca, modelo e variantes críticas coincidem; grupos `family` são alternativas comparáveis, jamais equivalência de SKU.

**Tech Stack:** Next.js/TypeScript, Supabase Postgres, Vitest, SQL migrations.

## Global Constraints

- Não iniciar, reiniciar, recarregar ou alterar o processo `oracle-scraper` no PM2; ele permanece parado.
- Não executar cenário real, inserir ofertas reais ou reativar a automação sem aprovação explícita posterior do usuário.
- A IA não classifica, ranqueia, escolhe marketplace ou aprova publicação; não chamar endpoints de IA nesta fase.
- Não modificar `scripts/oracle-scraper.cjs`, rotas de publicação, Vercel, banco remoto ou configurações de produção nesta fase.
- Classificação é determinística, versionada e explicável por regras; entrada ambígua recebe `review_required`.
- Produtos `accessory`, `bundle` e `coupon` nunca entram em grupos de produto principal.
- Grupo `exact` exige `product_type`, marca, modelo e atributos críticos conhecidos iguais; tensão divergente o impede.
- Grupo `family` exige tipo, forma/função e capacidade/faixa compatível; ele não afirma que os SKUs são idênticos.
- Toda tabela nova terá RLS; nenhuma política permitirá acesso cruzado de usuários.

---

## File Structure

- `supabase/migrations/20260721100000_classification_v2_foundation.sql`: tabelas isoladas e políticas RLS da V2.
- `src/core/classification/types.ts`: contratos de entrada, atributos, classificação e grupos.
- `src/core/classification/normalize.ts`: normalização pura de títulos, capacidade, tensão, potência e modelo.
- `src/core/classification/catalog.ts`: catálogo explícito de tipos, papéis, bloqueios e atributos críticos.
- `src/core/classification/classifier.ts`: classificação pura sem rede nem IA.
- `src/core/classification/grouping.ts`: chaves de grupo `exact` e `family` com bloqueios de segurança.
- `src/tests/supabase/classification-v2-schema.test.ts`: proteção estrutural da migration e RLS.
- `src/tests/core/classification/{normalize,classifier,grouping}.test.ts`: regressões de regra.

### Task 1: Criar o esquema isolado e protegido da V2

**Files:**
- Create: `supabase/migrations/20260721100000_classification_v2_foundation.sql`
- Create: `src/tests/supabase/classification-v2-schema.test.ts`

**Interfaces:**
- Produces: `discovery_runs`, `discovery_items`, `offer_classifications`, `product_groups`, `product_group_members`.
- Produces: auditoria `classifier_version`, `rule_trace`, `classification_status` e `created_at`.

- [ ] **Step 1: Escrever o teste estrutural que falha**

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const sql = readFileSync('supabase/migrations/20260721100000_classification_v2_foundation.sql', 'utf8')
describe('classification v2 schema', () => {
  it('keeps raw discovery, classification and groups separated with RLS', () => {
    for (const table of ['discovery_runs', 'discovery_items', 'offer_classifications', 'product_groups', 'product_group_members']) {
      expect(sql).toContain(`create table if not exists public.\${table}`)
      expect(sql).toContain(`alter table public.\${table} enable row level security`)
    }
    expect(sql).toContain('classifier_version text not null')
    expect(sql).toContain('rule_trace jsonb not null default')
    expect(sql).toContain("classification_status text not null check (classification_status in ('classified', 'review_required', 'excluded'))")
  })
})
```

- [ ] **Step 2: Executar o teste para confirmar falha**

Run: `npx vitest run src/tests/supabase/classification-v2-schema.test.ts`

Expected: FAIL porque a migration ainda não existe.

- [ ] **Step 3: Criar a migration mínima**

```sql
create table if not exists public.discovery_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  marketplace text not null, scenario text not null, started_at timestamptz not null default now(),
  finished_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.discovery_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  discovery_run_id uuid not null references public.discovery_runs(id) on delete cascade,
  marketplace text not null, external_id text, source_url text not null, raw_payload jsonb not null,
  title_raw text not null, created_at timestamptz not null default now()
);
create table if not exists public.offer_classifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  discovery_item_id uuid not null unique references public.discovery_items(id) on delete cascade,
  classifier_version text not null,
  classification_status text not null check (classification_status in ('classified', 'review_required', 'excluded')),
  product_type text, product_role text not null, attributes jsonb not null default '{}'::jsonb,
  rule_trace jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.product_groups (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  group_kind text not null check (group_kind in ('exact', 'family')), group_key text not null,
  product_type text not null, attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique (user_id, group_kind, group_key)
);
create table if not exists public.product_group_members (
  product_group_id uuid not null references public.product_groups(id) on delete cascade,
  discovery_item_id uuid not null references public.discovery_items(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (product_group_id, discovery_item_id)
);
```

Add `enable row level security` to every table. Add owner-only `select`, `insert`, `update`, `delete` policies for the first four with `auth.uid() = user_id`. For members, each policy must use `exists (select 1 from public.product_groups g where g.id = product_group_id and g.user_id = auth.uid())`.

- [ ] **Step 4: Executar o teste de schema**

Run: `npx vitest run src/tests/supabase/classification-v2-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260721100000_classification_v2_foundation.sql src/tests/supabase/classification-v2-schema.test.ts
git commit -m "feat: add classification v2 foundation schema"
```

### Task 2: Normalizar atributos verificáveis do produto

**Files:**
- Create: `src/core/classification/types.ts`
- Create: `src/core/classification/normalize.ts`
- Create: `src/tests/core/classification/normalize.test.ts`

**Interfaces:**
- Produces: `normalizeTitle(title: string): string`, `extractCapacityLiters(title: string): number | undefined`, `extractVoltage(title: string): '127V' | '220V' | 'BIVOLT' | undefined`, `extractModel(title: string): string | undefined`.

- [ ] **Step 1: Escrever testes que falham**

```ts
expect(normalizeTitle('Air Fryer Mondial AFN-40-BI  4L')).toBe('air fryer mondial afn 40 bi 4l')
expect(extractCapacityLiters('Air Fryer 5,5 litros')).toBe(5.5)
expect(extractVoltage('Liquidificador 127 V')).toBe('127V')
expect(extractModel('Air Fryer Philco PAF95A 9,5L')).toBe('PAF95A')
```

- [ ] **Step 2: Executar e confirmar falha**

Run: `npx vitest run src/tests/core/classification/normalize.test.ts`

Expected: FAIL porque os módulos não existem.

- [ ] **Step 3: Implementar funções puras**

```ts
export function normalizeTitle(title: string) {
  return title.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
export function extractCapacityLiters(title: string) {
  const match = title.match(/(\\d+(?:[,.]\\d+)?)\\s*(?:l|litros?)\\b/i)
  return match ? Number(match[1].replace(',', '.')) : undefined
}
export function extractVoltage(title: string) {
  if (/bivolt/i.test(title)) return 'BIVOLT' as const
  const match = title.match(/\\b(127|220)\\s*v\\b/i)
  return match ? (`\${match[1]}V` as const) : undefined
}
export function extractModel(title: string) {
  return title.match(/\\b[A-Z]{2,}\\d+[A-Z\\d-]*\\b/i)?.[0]?.replace(/-/g, '').toUpperCase()
}
```

- [ ] **Step 4: Rodar testes de normalização**

Run: `npx vitest run src/tests/core/classification/normalize.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/classification/types.ts src/core/classification/normalize.ts src/tests/core/classification/normalize.test.ts
git commit -m "feat: normalize product attributes for classification"
```

### Task 3: Classificar tipo, papel e ambiguidade sem IA

**Files:**
- Create: `src/core/classification/catalog.ts`
- Create: `src/core/classification/classifier.ts`
- Create: `src/tests/core/classification/classifier.test.ts`

**Interfaces:**
- Consumes: normalizadores da Task 2.
- Produces: `classifyProduct(input: { title: string }): ClassificationResult`.

- [ ] **Step 1: Escrever os testes de regra que falham**

```ts
expect(classifyProduct({ title: 'Air Fryer Philco PAF95A 9,5L 220V 1800W' })).toMatchObject({ productType: 'air_fryer', productRole: 'main_product', status: 'classified', attributes: { brand: 'philco', model: 'PAF95A', capacityLiters: 9.5, voltage: '220V' } })
expect(classifyProduct({ title: 'Cesto de silicone para Air Fryer 5L' })).toMatchObject({ productType: 'air_fryer', productRole: 'accessory', status: 'excluded' })
expect(classifyProduct({ title: 'Air Fryer Forno 10L 17L' })).toMatchObject({ productRole: 'main_product', status: 'review_required' })
expect(classifyProduct({ title: 'Suporte de celular para carro' })).toMatchObject({ productType: 'smartphone', productRole: 'accessory', status: 'excluded' })
expect(classifyProduct({ title: 'Cadarço para tênis de corrida' })).toMatchObject({ productType: 'running_shoe', productRole: 'accessory', status: 'excluded' })
```

- [ ] **Step 2: Executar e confirmar falha**

Run: `npx vitest run src/tests/core/classification/classifier.test.ts`

Expected: FAIL porque catálogo e classificador não existem.

- [ ] **Step 3: Implementar catálogo explícito e classificador**

```ts
export type ProductRole = 'main_product' | 'accessory' | 'bundle' | 'coupon'
export type ClassificationStatus = 'classified' | 'review_required' | 'excluded'
const ACCESSORY = /\\b(cesto|silicone|suporte|cadarco|cadarço|refil|peca|peça)\\b/i
const AIR_FRYER = /\\bair\\s*fryer\\b/i
const SMARTPHONE = /\\b(celular|smartphone)\\b/i
const RUNNING_SHOE = /\\b(tenis|tênis).*(corrida|running)|(corrida|running).*\\b(tenis|tênis)\\b/i

export function classifyProduct({ title }: { title: string }) {
  const productType = AIR_FRYER.test(title) ? 'air_fryer' : SMARTPHONE.test(title) ? 'smartphone' : RUNNING_SHOE.test(title) ? 'running_shoe' : undefined
  const productRole: ProductRole = ACCESSORY.test(title) ? 'accessory' : /\\b(combo|kit)\\b/i.test(title) ? 'bundle' : /\\b(cupom|voucher)\\b/i.test(title) ? 'coupon' : 'main_product'
  const conflictingCapacities = [...title.matchAll(/\\b\\d+(?:[,.]\\d+)?\\s*l\\b/gi)].length > 1
  const status: ClassificationStatus = productRole === 'main_product' ? (productType && !conflictingCapacities ? 'classified' : 'review_required') : 'excluded'
  return { productType, productRole, status, attributes: extractAttributes(title), ruleTrace: [] }
}
```

`extractAttributes` deve usar somente os normalizadores da Task 2 e catálogo de marcas inicial: `philco`, `mondial`, `oster`, `arno`, `electrolux`, `walita` e `britania`.

- [ ] **Step 4: Rodar testes do classificador**

Run: `npx vitest run src/tests/core/classification/classifier.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/classification/catalog.ts src/core/classification/classifier.ts src/tests/core/classification/classifier.test.ts
git commit -m "feat: classify products deterministically"
```

### Task 4: Gerar somente grupos de comparação seguros

**Files:**
- Create: `src/core/classification/grouping.ts`
- Create: `src/tests/core/classification/grouping.test.ts`

**Interfaces:**
- Consumes: `ClassificationResult` da Task 3.
- Produces: `buildGroupKeys(result: ClassificationResult): GroupKey[]`, com `GroupKey = { kind: 'exact' | 'family'; key: string }`.

- [ ] **Step 1: Escrever testes que falham**

```ts
expect(buildGroupKeys(classifiedPhilco)).toEqual([
  { kind: 'exact', key: 'exact:air_fryer:philco:paf95a:basket:9.5l:220v' },
  { kind: 'family', key: 'family:air_fryer:basket:9.5l' },
])
expect(buildGroupKeys({ ...classifiedPhilco, attributes: { ...classifiedPhilco.attributes, voltage: undefined }, status: 'review_required' })).toEqual([
  { kind: 'family', key: 'family:air_fryer:basket:9.5l' },
])
expect(buildGroupKeys(accessoryBasket)).toEqual([])
```

- [ ] **Step 2: Executar e confirmar falha**

Run: `npx vitest run src/tests/core/classification/grouping.test.ts`

Expected: FAIL porque `buildGroupKeys` não existe.

- [ ] **Step 3: Implementar regras de grupo**

```ts
export function buildGroupKeys(result: ClassificationResult): GroupKey[] {
  if (result.productRole !== 'main_product' || !result.productType) return []
  const { brand, model, capacityLiters, voltage, formFactor } = result.attributes
  const family = capacityLiters && formFactor ? [{ kind: 'family' as const, key: `family:\${result.productType}:\${formFactor}:\${capacityLiters}l` }] : []
  if (result.status !== 'classified' || !brand || !model || !capacityLiters || !voltage || !formFactor) return family
  return [{ kind: 'exact', key: `exact:\${result.productType}:\${brand}:\${model}:\${formFactor}:\${capacityLiters}l:\${voltage.toLowerCase()}` }, ...family]
}
```

`formFactor` deve vir do catálogo (air fryer convencional: `basket`); ausência impede o grupo `exact`.

- [ ] **Step 4: Rodar testes de agrupamento**

Run: `npx vitest run src/tests/core/classification/grouping.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/classification/grouping.ts src/tests/core/classification/grouping.test.ts
git commit -m "feat: add safe product grouping keys"
```

### Task 5: Verificar a fundação e fechar o gate

**Files:**
- Modify: `docs/superpowers/specs/2026-07-21-classificacao-publicacao-v2-design.md` somente após a verificação completa ter resultado positivo.

- [ ] **Step 1: Executar toda a suíte específica**

Run: `npx vitest run src/tests/supabase/classification-v2-schema.test.ts src/tests/core/classification/normalize.test.ts src/tests/core/classification/classifier.test.ts src/tests/core/classification/grouping.test.ts`

Expected: 0 falhas.

- [ ] **Step 2: Executar verificação de tipos**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Verificar que o escopo operacional ficou intacto**

Run: `git diff main...HEAD -- scripts/oracle-scraper.cjs src/app/api/ai/generate/route.ts; git status --short`

Expected: nenhum diff nos arquivos operacionais bloqueados; somente arquivos desta fundação e documentação.

- [ ] **Step 4: Registrar o gate sem aplicar migration remota**

Adicionar data, comandos, resultado e a frase: `Nenhuma migration foi aplicada ao Supabase remoto; Oracle permanece parada.`

- [ ] **Step 5: Commit**

```powershell
git add docs/superpowers/specs/2026-07-21-classificacao-publicacao-v2-design.md
git commit -m "docs: record classification foundation verification"
```

## Next Plans Explicitly Blocked Until This Gate

1. Tela de curadoria com matriz de decisão e perfis de compra.
2. Copy V2: IA somente redige depois da decisão humana e não inventa urgência.
3. Adaptadores de discovery para Shopee, Amazon e Mercado Livre gravando dados brutos na V2.
4. Cenários manuais controlados, inspeção de resultados e aprovação explícita do usuário.
5. Reativação da automação da Oracle, somente após aprovação posterior do usuário.

