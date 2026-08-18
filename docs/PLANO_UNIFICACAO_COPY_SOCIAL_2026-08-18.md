# Plano de Unificação da Copy Social — 2026-08-18

<!-- plan-status: awaiting-approval -->
<!-- based-on: 39125eed45a637793fdc60fb85c7b53b5f7fb18e -->

## 1. Objetivo

Unificar a geração de copy social do Caça Oferta Oficial para que uma mesma oferta produza o mesmo padrão editorial independentemente da origem:

- página `/trends`;
- ciclos automáticos executados pela Oracle;
- Publicação Expressa.

A mudança deve preservar as regras atuais de segurança, publicação e monetização de cada canal. Este documento é apenas o plano de execução. Nenhuma alteração de runtime está autorizada enquanto o plano estiver com `plan-status: awaiting-approval`.

## 2. Problema observado

A copy recentemente melhorada aparece corretamente no fluxo de `/trends`, porém as ofertas processadas nos ciclos automáticos da Oracle e na Publicação Expressa continuam apresentando uma composição diferente/antiga.

A análise do runtime identificou duas autoridades de renderização social ativas:

1. `/trends` chama diretamente `buildCopyV2ChannelCopy(...)` em `src/lib/trends/selection-social-drafts.ts`.
2. Oracle e Publicação Expressa passam por `generateOfficialAI(...)`, cujo serviço central monta `channelCopies` com `buildCopyV3ChannelCopy(...)` em `src/core/ai/official-ai-service.ts`.

As flags `copyV2`, `copyV2Auto` e `copyV3Express` participam da resolução do modo operacional, mas não garantem que todos os fluxos utilizem a mesma função final de renderização.

Resultado: a origem da oferta influencia o formato final da copy, quando deveria influenciar apenas ingestão, curadoria e contexto operacional.

## 3. Causa raiz

A causa raiz é arquitetural: existem dois renderers sociais em uso no caminho produtivo.

```text
/trends
  -> prepareTrendSocialDrafts
  -> buildCopyV2ChannelCopy
  -> posts.content

Oracle / PROCESS_OFFERS
  -> /api/ai/generate
  -> generateOfficialAI
  -> buildCopyV3ChannelCopy
  -> persistDrafts
  -> posts.content

Publicação Expressa
  -> generateOfficialAI
  -> buildCopyV3ChannelCopy
  -> persistDrafts
  -> posts.content
```

A solução não será duplicar as melhorias em vários pontos. Será estabelecer uma única autoridade para a composição final da copy social.

## 4. Princípio arquitetural alvo

Será criada/estabelecida uma função canônica de renderização social, com responsabilidade única de transformar fatos já validados em copy por canal.

Nome de trabalho:

```ts
buildOfficialSocialChannelCopy(...)
```

O nome definitivo poderá ser ajustado durante a implementação, mas a regra arquitetural não muda: `/trends`, Oracle e Publicação Expressa deverão convergir para a mesma autoridade final.

A função canônica deve preservar o formato editorial aprovado na copy atualmente percebida como correta em `/trends`, sem perder proteções úteis já existentes na Copy V3, especialmente:

- uso exclusivo de fatos persistidos;
- deduplicação semântica;
- limpeza/compactação segura do nome do produto;
- preço e desconto determinísticos;
- frete somente quando comprovado;
- atributos somente quando comprovados;
- prevenção de urgência/escassez inventada;
- CTA específico por canal;
- hashtags específicas por canal;
- materialização segura de links no estágio correto.

## 5. Invariantes obrigatórias por canal

Estas regras são requisitos de segurança e não poderão ser alteradas pela unificação.

### 5.1 Instagram

A copy persistida/publicada no Instagram NÃO pode conter URL ou link direto.

Devem ser bloqueados na copy final, inclusive em regressões futuras:

- `http://`;
- `https://`;
- `www.`;
- URL rastreada;
- link afiliado direto;
- qualquer tentativa de anexar o destino monetizado ao texto do post.

O processo atual que direciona o destino comercial para a vitrine do Instagram permanece fora do escopo desta mudança e NÃO deve ser alterado.

O Instagram continuará recebendo hashtags, geradas pela camada oficial de hashtags.

### 5.2 Facebook

A copy principal do Facebook NÃO pode conter URL ou link direto.

Devem ser bloqueados na copy principal:

- `http://`;
- `https://`;
- `www.`;
- URL rastreada;
- link afiliado direto.

O processo atual que publica o link automaticamente no primeiro comentário permanece fora do escopo desta mudança e NÃO deve ser alterado.

O Facebook continuará recebendo hashtags, com estratégia própria e mais enxuta que a do Instagram.

### 5.3 WhatsApp

O WhatsApp pode receber o link rastreado na posição definida pelo materializador oficial.

A unificação não deve duplicar URLs nem alterar a autoridade de `affiliate_links.tracked_url`.

### 5.4 Telegram

O Telegram pode receber o link rastreado na posição definida pelo materializador oficial.

A unificação não deve inventar ou reconstruir links quando já existir o link oficial persistido.

## 6. Hashtags — melhoria prevista

A unificação incluirá uma revisão controlada de `renderSocialHashtags(...)` para melhorar relevância e reduzir repetição.

### Instagram

Objetivo: hashtags contextualizadas e variadas, sem excesso.

Fontes permitidas:

- categoria persistida;
- termos seguros do nome real do produto;
- marketplace;
- intenção comercial comprovada;
- atributos comprovados nos dados persistidos.

Regras:

- deduplicar hashtags equivalentes;
- limitar quantidade por canal;
- evitar sequências fixas idênticas em todas as ofertas;
- reduzir hashtags genéricas quando não agregarem contexto;
- nunca inventar marca, atributo, uso ou especificação;
- nunca transformar claims não comprovados em hashtag;
- manter saída determinística para os mesmos fatos.

### Facebook

Objetivo: bloco menor e mais editorial.

Regras:

- menor quantidade que Instagram;
- priorizar produto/categoria/contexto;
- evitar poluição visual;
- aplicar as mesmas regras factuais e de deduplicação.

### WhatsApp e Telegram

Permanecem sem hashtags por padrão, salvo se um contrato editorial já existente exigir explicitamente o contrário. Esta alteração não criará hashtags nesses canais por conta própria.

## 7. O que NÃO será alterado

A implementação não deve modificar, salvo se um teste demonstrar dependência técnica indispensável e a mudança for novamente submetida à aprovação:

- Shopee Search Engine V1;
- lógica de descoberta da Oracle;
- scheduler dos ciclos Oracle;
- ranking/seleção do Trends/Radar;
- cálculo de preço ou desconto;
- monetização de marketplace;
- schema do Supabase;
- migrations;
- Instagram Policy Guard;
- Instagram Safety;
- processo de vitrine/link do Instagram;
- processo de primeiro comentário do Facebook;
- transportes Graph API/Meta;
- publicação do WhatsApp;
- publicação do Telegram;
- lógica de aprovação/rejeição de ofertas;
- regras que impedem publicação de ofertas `rejected`.

## 8. Arquivos esperados no escopo técnico

A lista final será confirmada pelo diff, mas os pontos atualmente previstos são:

- `src/core/ai/prompt.ts`
  - consolidar/expôr o renderer social canônico;
  - preservar proteções úteis da Copy V3;
  - incorporar o formato editorial aprovado.

- `src/core/ai/official-ai-service.ts`
  - fazer Oracle e Publicação Expressa utilizarem a autoridade canônica;
  - remover divergência de renderer na montagem de `channelCopies`.

- `src/lib/trends/selection-social-drafts.ts`
  - trocar a dependência direta do renderer específico de Trends pela autoridade canônica;
  - manter comportamento de persistência e link do WhatsApp.

- `src/core/ai/social-hashtags.ts` ou arquivo equivalente atual
  - melhorar estratégia de hashtags de Instagram/Facebook sem inventar fatos.

- `src/lib/ai/official/supabase-official-ai-adapter.ts`
  - somente se necessário para fortalecer invariantes de materialização;
  - preservar o comportamento atual de links por canal.

- testes existentes em `src/tests/core/ai/**` e `src/tests/lib/ai/**`;
- novos testes de paridade entre os três fluxos, se não houver local adequado nos testes atuais.

Não é objetivo desta tarefa alterar os transports sociais.

## 9. Estratégia de idempotência e drafts existentes

Existe uma segunda condição importante: ofertas que já possuem posts/drafts podem não ser reprocessadas pelo ciclo automático, e `persistDrafts` somente sobrescreve um draft existente quando o comando carrega uma flag explícita de regeneração.

Portanto a implantação será dividida conceitualmente em dois grupos:

### Novas ofertas / novos drafts

Devem utilizar imediatamente a nova autoridade canônica depois da implantação.

### Drafts antigos ainda não publicados

Não serão sobrescritos em massa automaticamente durante esta mudança.

Qualquer backfill de drafts antigos será considerado uma operação separada, com:

- seleção explícita de status elegível;
- exclusão de posts publicados;
- proteção contra ofertas rejeitadas;
- dry-run/contagem antes da escrita;
- idempotência versionada;
- aprovação específica antes da execução.

## 10. Versionamento da copy

A alteração deverá possuir versão explícita do contrato/renderer para evitar replay silencioso de conteúdo de uma geração anterior.

Nome de trabalho:

```text
official-social-copy/v4
```

A implementação deverá verificar onde o versionamento deve entrar com menor impacto, podendo ser no contrato da copy, na fingerprint de idempotência ou na chave de geração.

Requisito: uma nova versão de copy não pode reutilizar silenciosamente um resultado idempotente produzido pelo renderer antigo quando a intenção for gerar um novo draft.

## 11. Tasks de implementação

### TASK 0 — Baseline e proteção de escopo

- [ ] Criar branch técnica baseada na `main` aprovada.
- [ ] Registrar SHA base.
- [ ] Confirmar que não existe PR concorrente alterando os mesmos renderers.
- [ ] Executar/registrar testes atuais de copy antes das mudanças.

Critério de aceite: baseline conhecida e sem mistura com alterações não relacionadas.

### TASK 1 — Formalizar o contrato canônico da copy social

- [ ] Definir interface/fatos aceitos pelo renderer.
- [ ] Definir saída por canal.
- [ ] Manter IA fora de preço, seleção, monetização e compliance.
- [ ] Preservar apenas atributos sustentados pelos dados.

Critério de aceite: uma única API interna pode renderizar Telegram, WhatsApp, Instagram e Facebook.

### TASK 2 — Criar a autoridade única de renderização

- [ ] Consolidar a estrutura editorial aprovada no renderer canônico.
- [ ] Incorporar deduplicação e proteções factuais úteis do caminho V3.
- [ ] Remover necessidade de escolher V2/V3 pelo ponto chamador para a composição final.

Critério de aceite: os chamadores não decidem mais qual versão visual de copy utilizar.

### TASK 3 — Migrar `/trends`

- [ ] Substituir chamada direta ao renderer específico pelo renderer canônico.
- [ ] Preservar criação de `affiliate_links`.
- [ ] Preservar anexação do link somente no WhatsApp quando aplicável.
- [ ] Não alterar seleção/approval do Trends.

Critério de aceite: o resultado visual aprovado do Trends não sofre regressão material.

### TASK 4 — Migrar ciclos automáticos Oracle

- [ ] Fazer `PROCESS_OFFERS` chegar ao mesmo renderer canônico.
- [ ] Preservar batch, checkpoint, concorrência e idempotência.
- [ ] Preservar estado `pending_manual_review` conforme contrato atual.
- [ ] Não alterar Discovery nem scheduler.

Critério de aceite: uma nova oferta do ciclo Oracle gera a mesma composição que a mesma oferta geraria pelo caminho canônico.

### TASK 5 — Migrar Publicação Expressa

- [ ] Fazer `generateOfficialAI` da Expressa utilizar o renderer canônico.
- [ ] Preservar resolução do marketplace e validação do produto.
- [ ] Preservar monetização e `affiliate_links`.
- [ ] Preservar fluxo assistido Shein.

Critério de aceite: uma nova Publicação Expressa gera a mesma estrutura editorial oficial por canal.

### TASK 6 — Blindar Instagram contra links na copy

- [ ] Adicionar teste explícito de ausência de `http://`.
- [ ] Adicionar teste explícito de ausência de `https://`.
- [ ] Adicionar teste explícito de ausência de `www.`.
- [ ] Testar que uma URL rastreada não aparece em `posts.content` do Instagram.
- [ ] Confirmar que o fluxo de vitrine permanece sem alterações no diff.

Critério de aceite: nenhum caminho de geração abrangido pela tarefa consegue materializar URL na copy do Instagram.

### TASK 7 — Blindar Facebook contra links na copy principal

- [ ] Adicionar os mesmos testes de ausência de URL na copy principal.
- [ ] Confirmar que `posts.content` não recebe link rastreado.
- [ ] Confirmar por inspeção de diff/teste que o mecanismo do primeiro comentário não foi alterado.

Critério de aceite: copy principal sem link e primeiro comentário preservado.

### TASK 8 — Melhorar hashtags de Instagram e Facebook

- [ ] Revisar `renderSocialHashtags(...)`.
- [ ] Separar limites de Instagram e Facebook.
- [ ] Deduplicar termos.
- [ ] Priorizar categoria/produto/contexto comprovado.
- [ ] Implementar lista de termos genéricos de baixa utilidade quando necessário.
- [ ] Garantir ausência de atributos inventados.
- [ ] Garantir estabilidade determinística.
- [ ] Criar testes de diversidade entre produtos/categorias diferentes.
- [ ] Criar testes de não repetição excessiva.

Critério de aceite: hashtags úteis, factuais, específicas e distintas conforme produto/categoria, mantendo um bloco menor no Facebook.

### TASK 9 — Testes de paridade entre origens

Para um mesmo fixture de oferta e canal:

- [ ] renderização direta usada pelo Trends;
- [ ] renderização do serviço Official AI usada pela Oracle;
- [ ] renderização do serviço usada pela Expressa;

Devem convergir ao mesmo conteúdo canônico antes das diferenças legítimas de materialização de link.

Casos obrigatórios:

- [ ] produto com desconto;
- [ ] produto sem desconto;
- [ ] frete grátis comprovado;
- [ ] atributo objetivo comprovado;
- [ ] ausência de atributo comprovado;
- [ ] título longo/duplicado;
- [ ] Instagram;
- [ ] Facebook;
- [ ] WhatsApp;
- [ ] Telegram.

Critério de aceite: origem da oferta não muda a identidade editorial da copy.

### TASK 10 — Idempotência/versionamento

- [ ] Definir versão nova do renderer/contrato.
- [ ] Garantir que novas gerações não façam replay de conteúdo antigo por chave incompatível.
- [ ] Preservar segurança contra duplicação de operações.
- [ ] Testar replay válido dentro da mesma versão.

Critério de aceite: atualização de copy e idempotência coexistem sem regeneração infinita ou replay incorreto.

### TASK 11 — Regressão dos fluxos sociais

- [ ] Instagram Policy Guard continua antes da publicação.
- [ ] Oferta `rejected` continua sem poder publicar.
- [ ] Facebook continua enviando link pelo mecanismo atual de comentário.
- [ ] Instagram continua usando seu mecanismo atual de vitrine/destino.
- [ ] WhatsApp não duplica URL.
- [ ] Telegram não duplica URL.

Critério de aceite: a alteração de copy não reabre riscos já corrigidos.

### TASK 12 — Validação de qualidade

Executar no mínimo:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run security:check
npm run docs:audit
```

Além disso, executar a suíte focada de copy/social e registrar os resultados na PR.

Critério de aceite: nenhuma regressão conhecida e Documentation Audit alinhado se documentos canônicos forem atualizados pela implementação.

### TASK 13 — Inspeção final do diff

- [ ] Confirmar que não houve mudança em Shopee Search Engine V1.
- [ ] Confirmar que não houve mudança no scheduler Oracle.
- [ ] Confirmar que não houve mudança nos transports de Instagram/Facebook sem necessidade aprovada.
- [ ] Confirmar especificamente que vitrine do Instagram e primeiro comentário do Facebook permanecem intactos.
- [ ] Confirmar lista final de arquivos e explicar qualquer arquivo fora do escopo inicialmente previsto.

Critério de aceite: diff focado e auditável.

## 12. Estratégia de rollout

A implantação proposta é conservadora:

1. Merge somente após testes e inspeção final.
2. Novos drafts passam a usar a autoridade canônica.
3. Não executar backfill histórico automaticamente.
4. Observar primeiro ciclo Oracle pós-deploy e uma Publicação Expressa controlada.
5. Comparar uma amostra de outputs entre Trends/Oracle/Expressa.
6. Se houver regressão editorial, reverter o commit/renderer sem alteração de schema.

## 13. Rollback

A solução deve permanecer reversível por código, sem migration destrutiva.

Rollback esperado:

- reverter a alteração do renderer/integração;
- manter `posts` já persistidos sem operação massiva automática;
- não alterar links afiliados existentes;
- não alterar estado de ofertas;
- preservar logs de geração para comparação.

Nenhuma mudança de schema é prevista, portanto o rollback não deve depender de rollback de banco.

## 14. Critérios globais de aceite

A implementação só será considerada concluída quando TODOS os itens abaixo forem verdadeiros:

1. `/trends`, Oracle e Publicação Expressa utilizam uma única autoridade final de copy social.
2. A mesma oferta produz a mesma estrutura editorial por canal, independentemente da origem.
3. Instagram não possui qualquer URL na copy.
4. Facebook não possui qualquer URL na copy principal.
5. O mecanismo de vitrine do Instagram não foi alterado.
6. O mecanismo de link no primeiro comentário do Facebook não foi alterado.
7. Instagram e Facebook continuam com hashtags.
8. Hashtags foram melhoradas para relevância, diversidade e factualidade.
9. WhatsApp e Telegram mantêm materialização correta do link rastreado, sem duplicação.
10. Preço, desconto, frete, atributos e identidade continuam factuais/determinísticos.
11. Instagram Policy Guard e bloqueio de ofertas rejeitadas continuam íntegros.
12. Nenhuma mudança foi feita na descoberta/scheduler Oracle ou Shopee Search Engine V1.
13. Testes, typecheck, build, security check e documentação aplicável passam.
14. O diff final foi inspecionado antes do merge.

## 15. Sequência de aprovação

Estado atual deste plano: **AGUARDANDO APROVAÇÃO**.

Após aprovação explícita:

1. criar branch técnica de implementação a partir da `main` atual;
2. executar TASK 0 a TASK 13;
3. abrir PR com descrição do contrato e das invariantes;
4. apresentar resultados dos testes e inspeção final;
5. somente concluir/mergear conforme autorização dada no fluxo da tarefa.

Até a aprovação, nenhuma alteração descrita neste plano deve ser aplicada ao runtime.
