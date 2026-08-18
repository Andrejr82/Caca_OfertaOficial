<!-- plan-status: awaiting-approval -->
<!-- based-on-main: 2045b3a92f71c46d5e33bb6366019c545b20990e -->
<!-- created-on: 2026-08-18 -->

# Plano de Correção — Monetização Mercado Livre

## 1. Objetivo

Este documento formaliza a correção da monetização do Mercado Livre no projeto Caça Ofertas Oficial.

A implementação somente será iniciada após aprovação explícita do plano.

Objetivos principais:

1. Garantir que toda publicação de Mercado Livre encaminhe o clique para um destino monetizado válido.
2. Preservar links oficiais gerados pela Central de Afiliados e Criadores do Mercado Livre.
3. Separar explicitamente URL de identificação do produto e URL de monetização.
4. Corrigir a Publicação Expressa para aceitar e preservar `meli.la` e URLs completas oficiais de afiliado.
5. Corrigir o ciclo automático Oracle / Official AI para não publicar Mercado Livre com URL comum quando a monetização não estiver confirmada.
6. Garantir que `/go/...` redirecione sempre para o destino afiliado aprovado.
7. Reduzir falsos positivos nas métricas internas de clique causados por crawlers de preview.
8. Adicionar testes e telemetria que impeçam regressão futura.

---

## 2. Resumo executivo do problema

O painel oficial do Mercado Livre apresentou 0 cliques nos últimos 7 dias, enquanto o tracking interno do Caça Ofertas registrou tráfego recente.

A investigação mostrou que o sistema pode contabilizar um clique em `/go/...` e, em seguida, redirecionar para uma URL comum do Mercado Livre sem atribuição de afiliado confirmada.

Também foi identificado que a Publicação Expressa reconhece `meli.la`, porém hoje resolve o produto e pode substituir a URL oficial fornecida pelo usuário por outra URL construída internamente.

A causa arquitetural central é a mistura de duas responsabilidades:

- `canonicalUrl`: URL técnica usada para identificação, extração e validação do produto;
- `affiliateUrl`: URL comercial usada como destino final monetizado.

Regra principal deste plano:

> Produto identificado não significa produto monetizado. Para Mercado Livre, a publicação só poderá prosseguir quando existir um destino afiliado explicitamente confirmado.

---

## 3. Evidências técnicas já confirmadas

### 3.1 Publicação Expressa

O fluxo atual reconhece `meli.la` como Mercado Livre e possui resolvedor com allowlist para o domínio.

Entretanto, depois da resolução, o fluxo pode chamar `generateMLAffiliateLinkWithId(canonicalUrl, mlAffiliateId)` e reconstruir a URL de monetização.

Para links oficiais da Central isso cria conflito de autoridade: o usuário fornece um link oficial e o sistema o substitui.

### 3.2 Oracle / Official AI

O adapter oficial persiste hoje `offer.originalUrl` em `affiliate_links.original_url`.

Para Mercado Livre, `offer.originalUrl` pode ser apenas uma URL comum do produto, suficiente para identificação, mas não suficiente para comprovar monetização.

### 3.3 Redirect `/go/...`

A rota pública usa `affiliate_links.original_url` como destino final.

Logo, se o registro estiver com uma URL comum, o sistema contabiliza o clique internamente, mas envia o usuário para um destino sem monetização confirmada.

### 3.4 Métricas internas

A rota `/go/...` registra o clique antes de diferenciar corretamente crawlers de preview, o que pode inflar a métrica interna.

### 3.5 Produção

A auditoria do banco encontrou grande quantidade de links Mercado Livre sem sinal explícito de afiliação preservada, ao mesmo tempo em que existem cliques internos registrados.

---

## 4. Arquitetura alvo

### 4.1 `canonicalUrl`

Usada para:

- resolver short links;
- identificar `item_id` / `product_id`;
- buscar preço e imagem;
- validar identidade;
- consultar APIs oficiais.

Nunca deve ser automaticamente considerada monetizada.

### 4.2 `affiliateUrl`

Usada para:

- destino comercial final;
- preservação da atribuição oficial de afiliado;
- `/go/...`;
- persistência em `affiliate_links.original_url` enquanto o schema atual permanecer.

### 4.3 Links oficiais da Central

Para `https://meli.la/...`:

- preservar o input como `affiliateUrl`;
- resolver somente para identificar o produto;
- nunca substituir automaticamente pelo destino canônico.

Para URL completa oficial do Mercado Livre com marcadores de afiliação/compartilhamento reconhecidos:

- preservar a URL original como `affiliateUrl`;
- extrair a URL canônica separadamente;
- não remover parâmetros necessários da URL comercial.

### 4.4 Classificação de monetização

Não assumir `partner_id` como única autoridade.

Criar classificação explícita, por exemplo:

- `official_meli_shortlink`;
- `official_affiliate_full_url`;
- `internally_generated_affiliate_url`;
- `plain_product_url`;
- `unknown`.

Somente classes aprovadas poderão ser usadas como destino monetizado.

---

## 5. Escopo

### Incluído

- Mercado Livre na Publicação Expressa;
- Mercado Livre no Oracle / Official AI;
- persistência de `affiliate_links`;
- redirect `/go/...`;
- classificação e validação de monetização;
- métricas de clique relacionadas a crawlers;
- telemetria;
- testes;
- auditoria histórica sem backfill automático.

### Fora de escopo

- Shopee Search Engine;
- algoritmo de descoberta do Oracle;
- ranking;
- preços e extração que já funcionam;
- sistema de copy;
- hashtags;
- Instagram Policy Guard;
- mecanismos atuais de publicação de Facebook/Instagram;
- backfill histórico automático;
- alteração de schema sem necessidade comprovada.

---

# 6. Plano de execução — 8 tasks

## TASK 1 — Baseline e contrato oficial de monetização

### Objetivo

Definir a autoridade única de monetização Mercado Livre antes de alterar qualquer fluxo de publicação.

### Checklist

- confirmar o SHA atual da `main` imediatamente antes da implementação;
- registrar o comportamento atual dos testes relacionados;
- mapear todos os pontos que criam, validam, persistem ou redirecionam links Mercado Livre;
- criar/centralizar um contrato determinístico para classificar inputs Mercado Livre;
- separar formalmente `canonicalUrl` e `affiliateUrl`;
- definir quais classes de URL são consideradas monetizadas;
- revisar a premissa atual de `partner_id` como autoridade única;
- definir comportamento fail-closed para classe `plain_product_url` ou `unknown`;
- manter sanitização de logs para `ua`, tokens e parâmetros sensíveis.

### Contrato sugerido

```ts
classifyMLAffiliateInput(url)
```

Saída sugerida:

```ts
{
  kind:
    | "official_meli_shortlink"
    | "official_affiliate_full_url"
    | "internally_generated_affiliate_url"
    | "plain_product_url"
    | "unknown";
  monetized: boolean;
  affiliateUrl?: string;
}
```

### Critérios de aceite

- existe uma única regra central para classificar monetização ML;
- `meli.la` oficial é reconhecido sem ser destruído pela resolução;
- URL comum do produto não é tratada como monetizada;
- `canonicalUrl` e `affiliateUrl` deixam de ser semanticamente intercambiáveis;
- nenhum fluxo de publicação é alterado ainda além do necessário para introduzir/testar o contrato.

---

## TASK 2 — Corrigir Publicação Expressa

### Objetivo

Aceitar links oficiais da Central e preservar a monetização recebida.

### Checklist

- preservar `meli.la` como `affiliateUrl`;
- usar a URL resolvida somente para identidade/extração;
- preservar URLs completas oficiais da Central;
- revisar `generateMLAffiliateLinkWithId` para deixar de ser autoridade universal;
- revisar `validateAffiliateMonetization` para usar a classificação central;
- manter `canonicalUrl` e `affiliateUrl` separados até a persistência;
- garantir que `buildExpressAffiliateLinks` receba o `affiliateUrl` aprovado;
- rejeitar explicitamente URL comum quando não houver mecanismo comprovado para monetização.

### Critérios de aceite

- `meli.la` oficial entra na Publicação Expressa e permanece como destino final;
- URL completa oficial permanece preservada;
- URL canônica nunca sobrescreve a URL afiliada;
- URL comum não passa como monetizada por acidente.

---

## TASK 3 — Corrigir Oracle / Official AI

### Objetivo

Impedir que ciclos automáticos Mercado Livre publiquem links sem monetização confirmada.

### Checklist

- remover a suposição `offer.original_url = affiliate_url` para Mercado Livre;
- definir um resolver/port de monetização específico para ML;
- confirmar tecnicamente qual fonte oficial pode gerar/fornecer o link afiliado para ofertas descobertas automaticamente;
- aceitar apenas monetização comprovada;
- aplicar fail-closed quando não houver destino monetizado;
- registrar reason code operacional;
- preservar comportamento de outros marketplaces;
- não sobrescrever drafts antigos automaticamente.

### Critérios de aceite

- Oracle nunca publica Mercado Livre com URL comum silenciosamente;
- oferta monetizada persiste o destino afiliado correto;
- oferta sem monetização confirmada é bloqueada de forma explícita;
- Shopee/Amazon/Shein permanecem inalterados.

---

## TASK 4 — Corrigir `/go/...` e métricas de clique

### Objetivo

Garantir que o redirect use o destino afiliado e que a métrica interna represente melhor cliques humanos.

### Checklist

- redirect sempre usa o `affiliateUrl` persistido;
- nunca substituir por `canonicalUrl` quando existir destino afiliado;
- diferenciar crawler de WhatsApp;
- diferenciar `facebookexternalhit`;
- avaliar outros crawlers de preview relevantes;
- preservar Open Graph e previews atuais;
- não inflar `affiliate_links.clicks` com crawlers conhecidos;
- manter erro seguro para URL inválida.

### Critérios de aceite

- clique humano → tracking + destino afiliado;
- crawler de preview → preview preservado sem inflar clique humano;
- nenhuma regressão em WhatsApp/Facebook preview.

---

## TASK 5 — Telemetria e segurança

### Objetivo

Tornar falhas de monetização observáveis sem expor dados sensíveis.

### Checklist

Eventos estruturados sugeridos:

```text
ml.affiliate.input.classified
ml.affiliate.destination.accepted
ml.affiliate.destination.rejected
ml.affiliate.oracle.blocked_unmonetized
ml.affiliate.express.preserved_official_link
```

Campos permitidos:

- `offerId`;
- `channel`;
- `source`;
- `classification`;
- `monetized`;
- `host`;
- `itemId`;
- `reasonCode`.

Campos proibidos:

- `ua` completo;
- access tokens;
- secrets;
- URL afiliada completa quando contiver parâmetros sensíveis.

Também manter:

- SSRF;
- allowlist de domínios;
- proteção contra redirect inesperado;
- mismatch de produto bloqueado.

### Critérios de aceite

- falhas são diagnosticáveis por reason code;
- logs não expõem credenciais/parâmetros sensíveis;
- controles de segurança existentes continuam passando.

---

## TASK 6 — Testes completos e regressão

### Objetivo

Cobrir todos os contratos alterados em uma única etapa de validação automatizada.

### Checklist

Testes unitários:

- `meli.la` reconhecido e preservado;
- URL completa oficial preservada;
- URL comum rejeitada como monetizada;
- `partner_id` não é única condição possível;
- canonical nunca substitui affiliate;
- mismatch/SSRF/redirect safety preservados.

Testes Publicação Expressa:

- `meli.la`;
- URL oficial completa;
- URL comum sem monetização;
- persistência em `affiliate_links`.

Testes Oracle:

- bloqueio sem monetização;
- persistência com monetização confirmada;
- regressão de outros marketplaces.

Testes `/go`:

- humano;
- crawler;
- redirect afiliado;
- URL inválida.

### Critérios de aceite

- todos os testes relacionados passam;
- nenhuma regressão em Shopee/Amazon/Shein;
- nenhuma regressão de segurança.

---

## TASK 7 — Auditoria dos links históricos

### Objetivo

Entender impacto legado sem executar backfill automático.

### Checklist

- contar links ML existentes;
- separar `meli.la`, URLs oficiais completas, URLs comuns e desconhecidas;
- identificar links publicados ainda ativos;
- identificar drafts não publicados;
- gerar relatório de impacto;
- não alterar registros históricos automaticamente.

### Tratamento posterior

- publicados ativos: correção somente se houver destino oficial válido;
- drafts: candidatos a regeneração controlada;
- antigos/inativos: não alterar por padrão.

Qualquer backfill em produção exigirá aprovação separada.

### Critério de aceite

- relatório objetivo do legado sem mutação do banco.

---

## TASK 8 — Inspeção final, deploy e teste real controlado

### Objetivo

Certificar código, deploy e atribuição real no programa de afiliados.

### Checklist pré-merge

- revisar diff completo;
- confirmar que nenhuma copy/hashtag foi alterada;
- confirmar que Instagram/Facebook não foram alterados;
- confirmar Shopee/Amazon/Shein sem regressão;
- confirmar segurança SSRF/redirect;
- confirmar telemetria sem dados sensíveis;
- confirmar testes.

### Teste real pós-deploy

1. escolher um produto da Central de Afiliados;
2. copiar o `meli.la` oficial;
3. processar pela Publicação Expressa;
4. confirmar que `affiliate_links.original_url` preserva o link oficial;
5. publicar em canal controlado;
6. realizar um clique manual real;
7. confirmar incremento interno correto;
8. aguardar a janela de atualização do Mercado Livre;
9. confirmar atribuição no painel oficial.

Não gerar cliques artificiais em massa.

### Critérios de aceite

- deploy saudável;
- destino afiliado preservado em produção;
- clique interno coerente;
- clique atribuído no painel do Mercado Livre após a janela de atualização.

---

## 7. Arquivos prováveis de alteração

Lista a confirmar na TASK 1:

- `src/lib/platforms/mercadolivre.ts`
- `src/lib/publish/actions.ts`
- `src/lib/publish/express-url-resolver.ts`
- `src/lib/publish/express-affiliate-links.ts`
- `src/lib/publish/ml-extraction-url.ts`
- `src/lib/ai/official/supabase-official-ai-adapter.ts`
- `src/app/go/[...subId]/route.ts`
- testes relacionados em `src/tests/...`

Pode ser criado módulo dedicado, por exemplo:

`src/lib/platforms/mercadolivre-affiliate.ts`

se isso reduzir acoplamento.

---

## 8. Invariantes

### Mercado Livre

- produto errado nunca pode ser monetizado no lugar do informado;
- `meli.la` oficial não pode ser descartado silenciosamente;
- URL afiliada não pode ser substituída por URL comum;
- publicação automática deve fail-close sem monetização confirmada.

### Segurança

- SSRF permanece ativa;
- redirect inesperado permanece bloqueado;
- tokens nunca aparecem em logs;
- parâmetros sensíveis são sanitizados.

### Outros marketplaces

- Shopee permanece como está;
- Amazon permanece como está;
- Shein permanece como está.

### Redes sociais

- nenhuma alteração de copy;
- nenhuma alteração em hashtags;
- nenhuma alteração no comentário automático do Facebook;
- nenhuma alteração na vitrine do Instagram.

---

## 9. Critérios globais de aceite

1. Publicação Expressa aceita `meli.la` oficial de produto.
2. `meli.la` é preservado como destino afiliado.
3. URL resolvida é usada somente para identidade/extração quando houver link oficial original.
4. URL completa oficial é preservada.
5. URL comum não é tratada como monetizada acidentalmente.
6. Oracle não publica ML sem monetização confirmada.
7. `/go/...` redireciona para o `affiliateUrl` correto.
8. Crawlers conhecidos não contaminam a métrica humana.
9. Nenhuma regressão em Shopee/Amazon/Shein.
10. Nenhuma regressão de SSRF/redirect safety.
11. Todos os testes passam.
12. Teste real controlado confirma atribuição no painel Mercado Livre.

---

## 10. Rollback

A implementação deverá ser dividida em commits pequenos e reversíveis.

Em caso de problema:

1. reverter somente os commits de monetização Mercado Livre;
2. preservar alterações não relacionadas existentes na `main`;
3. não executar migração destrutiva;
4. manter registro dos links previamente publicados;
5. se houver dúvida sobre monetização, bloquear novas publicações ML até correção.

Fail-closed é preferível a publicar sem atribuição.

---

## 11. Status

**AWAITING APPROVAL**

Nenhuma alteração de runtime prevista neste plano deve começar antes da aprovação explícita do usuário.
