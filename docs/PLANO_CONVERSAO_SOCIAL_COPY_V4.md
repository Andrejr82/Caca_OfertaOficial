# Plano de Conversão Social — Copy V4

Data: 2026-08-20
Status: integração final em execução
Objetivo: sair de zero vendas priorizando conversão real em redes sociais sem reabrir o Radar sem evidência.

## Princípios

- Verdade comercial acima de agressividade.
- Nenhuma urgência, estoque, cupom, frete, rating, vendas ou prova inventada.
- Uma ação principal por publicação.
- Provas reais devem ter prioridade: preço, economia em R$, desconto válido, bestseller, posição oficial, loja oficial/Mall, rating e vendas quando persistidos.
- Menos volume e mais ofertas-herói.
- Medir publicação -> clique -> compra.
- Não misturar mudanças de Radar nesta frente.
- Toda implementação deve permanecer documentada em `docs`.
- TDD, regressões, lint/typecheck/build antes do merge final.
- Vercel: acumular as tasks no mesmo programa e realizar um único deploy de produção no merge final; nunca fazer deploy manual para teste.
- Oracle: qualquer task que altere runtime/scripts Oracle exige prompt Gemini específico para execução pelo operador. Não executar Oracle automaticamente.

## Roadmap

### Task 1 — Copy V4: contrato de decisão de compra
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Contrato:
`Hook -> benefício/motivo -> prova -> oferta/economia -> CTA único`.

Ângulos comerciais:
- `proof`
- `saving`
- `price`
- `benefit`
- `standard`

Critérios:
- proof vence quando há evidência forte e verificável;
- saving usa apenas preço anterior válido;
- price favorece comunicação objetiva de ticket de impulso abaixo de R$100 quando não há prova/desconto melhor;
- benefit usa somente atributos sustentados pelos dados;
- standard é fallback seguro;
- CTA único por canal;
- sem falsa urgência.

Arquivos da Task 1:
- `src/core/ai/copy-v4.ts`
- `src/tests/core/ai/copy-v4.test.ts`

### Task 2 — Seleção de ofertas-herói
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Classificações:
- `HERO`: prioridade máxima de exposição social;
- `TEST`: boa candidata para exploração controlada;
- `NORMAL`: oportunidade válida, sem prioridade especial;
- `SKIP_SOCIAL`: não deve entrar na fila social por falha básica de preço/link.

Regras duras:
- ausência de comissão nunca elimina nem penaliza a oferta;
- comissão não participa do score;
- link HTTPS e preço positivo são obrigatórios;
- exposição recente é penalidade, não blacklist;
- no máximo 3 HERO por seleção por padrão;
- apenas um HERO por cluster semântico;
- nenhuma classificação publica automaticamente.

Arquivos da Task 2:
- `src/lib/social/hero-selection.ts`
- `src/tests/lib/social/hero-selection.test.ts`

Fixture principal: Mochila Jiesipote por R$88, preço anterior R$269 e BEST_SELLER Top #14 deve resultar em `HERO` sem depender de comissão.

### Task 3 — WhatsApp Conversion
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Ordem:
`Hook -> prova -> preço/economia -> benefício -> condição factual -> CTA + link rastreado`.

Regras:
- máximo de 6 blocos;
- sem hashtags;
- exatamente uma CTA `Conferir o preço atual`;
- exatamente um tracked URL HTTPS;
- frete só quando confirmado;
- nenhuma urgência inventada;
- nenhuma publicação automática.

Arquivos:
- `src/lib/social/whatsapp-conversion.ts`
- `src/tests/lib/social/whatsapp-conversion.test.ts`

### Task 4 — Instagram Stories + Reels
Status: IMPLEMENTADA; ENTREGA META SENDO INTEGRADA COM STORIES MANUAL E REELS DESATIVADO POR PADRÃO.

Stories V4 — 3 telas:
1. hook;
2. prova + preço/economia;
3. CTA `Conferir o preço atual`.

Decisão de integração Meta:
- modo Stories desta fase: `manual_link_sticker`;
- o sistema prepara as 3 telas e o tracked URL;
- o operador adiciona manualmente o sticker de link na terceira tela;
- `publishAutomatically: false`;
- Reels exige opt-in explícito `INSTAGRAM_REELS_V4_ENABLED=true` e permanece desligado por padrão.

Motivo: a publicação de Stories via API não entrega o sticker interativo necessário para o CTA rastreável; e a geração audiovisual de Reels ainda não está homologada de ponta a ponta.

Arquivos:
- `src/lib/social/instagram-conversion.ts`
- `src/tests/lib/social/instagram-conversion.test.ts`
- `src/lib/social/meta-delivery-policy.ts`
- `src/tests/lib/social/meta-delivery-policy.test.ts`

### Task 5 — Telegram Conversion
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Formato de alerta curto:
`Hook -> prova -> preço/economia -> benefício -> condição factual -> CTA + link rastreado`.

Arquivos:
- `src/lib/social/telegram-conversion.ts`
- `src/tests/lib/social/telegram-conversion.test.ts`

### Task 6 — Facebook Conversion
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Contrato:
- feed: hook -> prova -> preço/economia -> benefício -> condição factual -> CTA para primeiro comentário;
- primeiro comentário: CTA + tracked URL HTTPS.

A infraestrutura oficial de publicação já aceita `affiliateLink` para o primeiro comentário; a integração final deve preservar o feed sem URL direta.

Arquivos:
- `src/lib/social/facebook-conversion.ts`
- `src/tests/lib/social/facebook-conversion.test.ts`

### Task 7 — Telemetria comercial
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Mede por oferta x canal:
- publicação;
- impressão quando conhecida;
- clique / CTR;
- compra / conversão;
- EPC quando há ganho afiliado real;
- estágio `unpublished | no_click | no_purchase | converted`.

Ausência de denominador ou receita permanece `null`, nunca zero inventado.

Arquivos:
- `src/lib/social/commercial-telemetry.ts`
- `src/tests/lib/social/commercial-telemetry.test.ts`
- `docs/TASK_07_TELEMETRIA_COMERCIAL.md`

### Task 8 — Experimentos A/B
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Compara `proof | saving | price | benefit | standard` apenas na mesma oferta e canal.

Guardrails:
- conversão comparável com pelo menos 20 cliques por variante;
- CTR como fallback com pelo menos 200 impressões por variante;
- pelo menos 10% de liderança relativa;
- `leader` é observacional, não prova causal/estatística.

Arquivos:
- `src/lib/social/copy-experiments.ts`
- `src/tests/lib/social/copy-experiments.test.ts`
- `docs/TASK_08_EXPERIMENTOS_AB_COPY.md`

### Task 9 — Cadência e fadiga
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Decisões:
`ALLOW | DEFER`.

Política padrão:
- mesma oferta + mesmo canal: 24h;
- mesmo cluster + mesmo canal: 8h;
- mesma oferta entre canais: 2h;
- máximo de 3 posts por canal em 2h.

Nunca cria blacklist permanente; `DEFER` retorna `nextEligibleAt`.

Arquivos:
- `src/lib/social/cadence-fatigue.ts`
- `src/tests/lib/social/cadence-fatigue.test.ts`
- `docs/TASK_09_CADENCIA_FADIGA.md`

### Task 10 — Aprendizado comercial
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

Recomendações:
- `LEARN_MORE`;
- `TEST_ANGLE`;
- `PREFER_ANGLE`;
- `INVESTIGATE_OFFER`;
- `WAIT_CADENCE`.

Regras:
- CTR líder sozinho gera teste, não preferência;
- `PREFER_ANGLE` exige liderança por conversão com compra real;
- `autoApply: false` sempre;
- não altera Radar, HERO score, preço ou publicação automaticamente.

Arquivos:
- `src/lib/social/commercial-learning.ts`
- `src/tests/lib/social/commercial-learning.test.ts`
- `docs/TASK_10_APRENDIZADO_COMERCIAL.md`

## Integração final

Status: EM EXECUÇÃO.

Decisões confirmadas:
- Stories é o formato prioritário de Instagram nesta fase;
- Stories usa handoff manual com sticker de link para preservar o tracked URL clicável;
- Reels fica desativado por padrão e só pode ser habilitado por opt-in explícito;
- não usar a fragilidade atual de Reels como bloqueio para WhatsApp, Telegram, Facebook e Stories;
- nenhuma publicação automática é introduzida.

Documento operacional: `docs/INTEGRACAO_FINAL_SOCIAL_COPY_V4.md`.

## Critério de saída do programa

Antes do merge final:
- integrar Copy V4 ao draft canônico por canal;
- preservar Facebook com URL no primeiro comentário, não no corpo;
- garantir Reels desligado por padrão;
- validar o handoff de Stories com tracked URL;
- testes verdes;
- lint verde;
- typecheck verde;
- build verde;
- security check verde;
- `git diff --check` equivalente limpo;
- revisão final de segurança factual;
- confirmar que nenhuma alteração exige Oracle não executada;
- um único merge em `main`;
- Vercel somente por auto-deploy do merge final.
