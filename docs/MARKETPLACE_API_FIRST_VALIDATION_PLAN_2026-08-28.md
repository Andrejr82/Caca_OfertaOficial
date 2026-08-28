# Marketplace API-First — Plano Mestre de Validação e Correção

> Status: **plano de execução e validação; não implementado**.
>
> Base técnica auditada: `main` em `1bf08df46b7aafd897af2e88ed327b1a15937f2d`.
>
> Branch documental: `docs/api-first-marketplace-validation-20260828`.
>
> Regra de release: **nenhum merge para `main` antes da execução completa das tasks, coleta das evidências e validação final independente**.

## 1. Objetivo

Resolver de forma sistemática os problemas de descoberta, filtros, classificação, ranking e diversidade dos marketplaces do Caça Ofertas Oficial usando como verdade primária o retorno das fontes oficiais já integradas ao runtime.

O método passa a ser:

`fonte/API real -> snapshot bruto -> filtros -> classificação -> ranking -> diversidade -> fila -> persistência -> auditoria`

A correção não deve mais partir apenas do produto final persistido. Cada perda do funil precisa ser explicável e reconciliável.

## 2. Princípios obrigatórios

1. **API/source-first.** Mercado Livre e Shopee devem ser validados diretamente pelos caminhos oficiais que já usam as credenciais do runtime. Site público serve apenas para inspeção visual/manual, nunca como fonte principal quando existe integração oficial.
2. **Amazon segue a melhor fonte oficialmente disponível no projeto.** Primeiro auditar se há credenciais/API oficial utilizável. Se não houver, usar o retorno bruto do coletor já existente como verdade de entrada e documentar a limitação; não criar scraping paralelo para “melhorar” o teste.
3. **Sem arquitetura paralela.** Reutilizar adapters, collectors, quality gates, classificadores, ranking, selectors e telemetry existentes. Scripts de diagnóstico/teste podem ser adicionados quando necessários, mas não podem virar um novo motor produtivo.
4. **Sem padding.** Nunca completar quantidade com produto fraco apenas para atingir meta numérica.
5. **Produto principal antes de preço.** Aderência e identidade correta do produto precedem score comercial.
6. **Diversidade condicionada à oferta real.** Não exigir famílias inexistentes; quando várias famílias fortes estiverem disponíveis, a fila não pode ser dominada artificialmente por uma só família.
7. **Contabilidade de perdas.** Cada estágio deve explicar `entrada = saída + rejeições daquele estágio`.
8. **Sem segredos em logs.** Tokens, refresh tokens, app secrets, chaves, cookies e credenciais nunca podem aparecer em reports, commits ou saída de teste.
9. **Fail closed.** Dado comercial ou classificação não comprovada não deve ser inventado.
10. **Merge só no final.** Commits e PR são permitidos na branch de implementação; merge para `main` fica bloqueado até validação final.

## 3. Estado conhecido antes deste plano

### 3.1 Ciclo controlado de Informática usado como evidência

Ciclo: `969a9a99-5728-4632-b658-605f272fe657`.

Runtime usado: `bd62fbf4784ce6ad1f5c123240e51c7815aaafb1`.

Resultado observado:

| Marketplace | Descoberta/funil | Persistência | Diagnóstico principal |
|---|---:|---:|---|
| Shopee | 279 extraídos; 128 após classificação/novidade | 10 novos + 5 atualizados | volume bom; semântica e concentração de famílias ainda imperfeitas |
| Mercado Livre | 5 candidatos finais | 5 novos | classificação corrigida, porém somente roteadores; descoberta/diversidade insuficientes |
| Amazon | 388 extraídos; 191 classificados | 10 novos | volume alto; acessórios, classificação e ranking ainda selecionavam itens inadequados |

### 3.2 Mercado Livre — problema já comprovado

Antes do PR #186, o funil tinha `7 -> 1` após classificação, com `classification_review_required=6`.

No ciclo controlado posterior, o ML chegou a `5/5` classificados, `0 unknown` e `0 review_required`. Portanto o gargalo de classificação daquele caso melhorou, mas o resultado final continuou concentrado em uma família: roteadores.

Também foi observado no log:

- `ML_official_intents result=13`;
- estágio seguinte recebeu 5 itens.

O plano exige contabilizar explicitamente qualquer queda equivalente; nenhum `13 -> 5` pode ficar sem razões por estágio.

O PR #187, já incorporado na base deste plano, corrigiu o encerramento prematuro de paginação do ML: a continuidade deve considerar a quantidade **bruta** recebida da página, e não a quantidade que sobreviveu ao filtro semântico. Também ampliou aliases editoriais mantendo o endpoint/guardrails existentes.

### 3.3 Amazon — problema já comprovado

A descoberta tem volume suficiente. O problema principal está depois da coleta.

Exemplos reais que não podem voltar a ser promovidos como produto principal de Informática:

- enrolador/organizador de cabos;
- kit de limpeza de eletrônicos;
- suporte de parede para laptop/roteador;
- suporte para SSD;
- SSD adapter;
- webcam classificada como notebook por mencionar “notebook”;
- mini PC classificado como SSD por mencionar “SSD”;
- teclado classificado em família Pet;
- computador classificado em família Pet.

O PR #187 já endureceu `product-title-quality`, removeu liberação ampla por `allowAccessory`, melhorou precedência do produto principal, adicionou semântica específica para `scanner`/`switch de rede` e reduziu a influência do score legado. Este plano deve provar que essas mudanças funcionam em dados reais, não apenas em testes unitários.

### 3.4 Shopee — problema já comprovado

A Shopee produz volume real e já usa o conjunto completo de fontes V1. Problemas restantes observados:

- repetição elevada de mouse/teclado quando existem outras famílias fortes;
- filamento de impressora/caneta 3D vazando semanticamente;
- caneta 3D podendo ser confundida com impressora;
- acessórios de manutenção de impressora 3D precisando ser barrados antes da seleção.

O gate de título já rejeitou parte desses itens; é necessário provar cobertura real e corrigir apenas lacunas restantes.

## 4. Fonte primária por marketplace

### Mercado Livre

Usar o fluxo oficial já existente no projeto, incluindo autenticação/refresh já implementados, mapa certificado, exploração editorial estrita, aliases, domínio/categoria, busca oficial e paginação segura.

Obrigatório capturar por família/intenção:

- termo/alias consultado;
- rota/fonte usada;
- offset/página;
- quantidade bruta retornada;
- identidade nativa do item;
- domínio/categoria quando disponíveis;
- aceitos/rejeitados semanticamente;
- razão primária de rejeição;
- candidatos após deduplicação/novidade;
- classificação;
- score;
- fila/persistência.

### Shopee

Usar as fontes oficiais já integradas ao OpenAPI V1 e o contrato efetivo do runtime. A validação deve preservar o conjunto já comprovado no projeto, incluindo fontes auxiliares/delta quando o wrapper oficial as habilita.

Obrigatório capturar:

- fonte (`productOffers`, `DELTA`, `shopOfferV2`, `shopeeOfferV2` ou nomenclatura canônica equivalente do runtime);
- ProductCatId/categoria;
- identidade de item/loja;
- bruto por fonte;
- duplicados entre fontes;
- semântica aceita/rejeitada;
- rating/vendas/desconto/comissão quando realmente fornecidos;
- título/produto principal;
- classificação;
- fila/persistência.

### Amazon

Primeiro inventariar a integração existente.

- Se houver API oficial + credenciais ativas no projeto, usar esse caminho.
- Se não houver, usar o output bruto do coletor oficial do próprio projeto (`Amazon_Top20_extraction`/adapter equivalente atual) e documentar explicitamente que a prova não é uma consulta API autenticada.
- Não criar navegador/scraper alternativo apenas para validar a correção.

Obrigatório capturar por intenção:

- query/intenção;
- bruto retornado;
- Browse Node/categoria quando houver;
- título e identidade;
- filtro semântico;
- product-title-quality;
- classificação;
- quality score;
- diversidade/fila;
- persistência.

## 5. Contrato de telemetria do funil

Cada marketplace deve conseguir produzir, em relatório de diagnóstico ou telemetria já existente, os seguintes contadores mínimos:

```text
source_requested
raw_received
after_parse
semantic_accepted
semantic_rejected
known_identity_rejected
scenario_mismatch_rejected
title_quality_rejected
quality_gate_rejected
after_identity_dedup
classification_classified
classification_unknown
classification_review_required
ranking_eligible
queue_selected
rpc_sent
inserted
updated
ignored
failed
```

Quando uma etapa não existir naquele marketplace, registrar `not_applicable`, não fabricar zero enganoso.

### Invariantes

Para cada transição de estágio:

```text
stage_input = stage_output + primary_rejections_at_stage
```

Cada candidato descartado recebe uma razão primária auditável. Razões secundárias podem existir, mas não podem quebrar a reconciliação.

Cada item persistido deve ser rastreável até:

```text
marketplace + native_identity + source + scenario + intent/family + observed_at
```

## 6. Regra de diversidade sem padding

A diversidade deve atuar **depois** que os candidatos já passaram pelos gates de produto principal, aderência, qualidade e classificação.

Definir `strongFamiliesAvailable` como as famílias com pelo menos um candidato que já passou todos os gates não relacionados a diversidade.

Seleção recomendada usando o selector existente:

1. ordenar candidatos dentro de cada família pelo score real;
2. selecionar primeiro o melhor item de cada família forte disponível;
3. somente depois permitir o segundo item de uma família;
4. repetir em rodadas até o limite da fila;
5. se existir apenas uma família forte, aceitar uma única família em vez de preencher com fracas;
6. nunca rejeitar um candidato objetivamente muito superior apenas para criar diversidade artificial; qualquer exceção deve aparecer na telemetria.

Critério operacional: quando `N >= 3` famílias fortes estão disponíveis e há espaço de fila, a seleção deve representar várias famílias antes de repetir excessivamente a mesma família.

## 7. Golden set de regressão

O projeto precisa manter fixtures/testes com positivos e negativos reais derivados dos erros observados.

### Negativos obrigatórios — Informática

- organizador/enrolador de cabo;
- kit de limpeza eletrônico;
- suporte para laptop/roteador;
- suporte para SSD;
- SSD adapter;
- filamento 3D;
- kit de manutenção de impressora 3D.

Esses itens não podem vencer como produto principal de Informática, exceto se uma futura intenção explicitamente acessória for criada e aprovada pelo contrato editorial.

### Classificação obrigatória

- `Mini PC ... SSD ...` -> Mini PC/computador, nunca SSD apenas por menção secundária;
- `Webcam ... para notebook ...` -> Webcam, nunca notebook;
- `Teclado ATTACK SHARK ...` -> teclado, nunca Pet;
- `Computador completo ...` -> computador/desktop, nunca Pet;
- `switch de rede ...` -> network switch;
- `scanner de documentos ...` -> scanner;
- detector de parede/RF retornado por query `scanner` -> rejeitado para scanner de Informática;
- caneta 3D -> nunca `printer` apenas por expressão promocional relacionada a impressão 3D.

### Positivos obrigatórios

Manter exemplos reais de notebook, monitor, SSD, impressora/multifuncional, roteador, mini PC/desktop, teclado, mouse, webcam, HD externo, scanner, nobreak e switch de rede que devem permanecer elegíveis quando os demais sinais forem válidos.

## 8. Critérios de sucesso por marketplace

### Mercado Livre

- paginação só para por página bruta curta, limite/budget seguro, erro de fonte ou condição explícita do contrato;
- nenhum desaparecimento de candidatos entre estágios sem reason count;
- candidatos válidos de Core/Expansion podem ser encontrados por caminhos oficiais existentes;
- `review_required` não pode ser usado como descarte silencioso de família válida;
- quando várias famílias fortes forem encontradas, a fila deve refletir essa diversidade;
- domínio proibido/acessório continua fail closed.

### Amazon

- volume de discovery preservado;
- zero itens do golden set negativo persistidos como produto principal;
- classificação sem falsos positivos cruzando Informática/Pet;
- menções secundárias não vencem produto principal;
- ranking não pode ser dominado pelo `deterministicScore` legado;
- quando várias famílias fortes estiverem disponíveis, seleção final deve ser balanceada sem padding.

### Shopee

- conjunto de fontes oficiais do runtime preservado;
- volume não pode cair por regressão de `includeDelta/includeAuxiliary`;
- filamento/manutenção/acessórios indevidos barrados;
- 3D pen não classificada como impressora;
- duplicidade entre fontes reconciliada;
- quando várias famílias fortes estiverem disponíveis, controlled persist não pode ser dominado por uma única família apenas por volume bruto.

## 9. Critérios globais de aceite

A implementação só pode ser considerada candidata a merge quando:

- todos os testes direcionados passam;
- golden set passa integralmente;
- contabilidade do funil reconcilia sem gaps inexplicados;
- nenhuma credencial aparece em log/report/commit;
- um ciclo controlado real de `informatica_editorial` passa nos três marketplaces;
- depois de Informática, pelo menos um smoke controlado dos demais nichos comprova ausência de regressão estrutural;
- os produtos realmente persistidos são auditados, não apenas os contadores;
- documentação final descreve exatamente o comportamento implementado;
- GitHub checks relevantes estão verdes;
- branch está atualizada contra a `main` antes da validação final;
- merge ainda não foi executado.

## 10. Fronteiras de segurança

### ORACLE — ENVOLVE PRODUÇÃO

Tasks que exigirem variáveis reais, ciclo produtivo, PM2, alinhamento de release ou execução do scraper na VPS são classificadas como **ORACLE**.

Este documento não autoriza mudança direta na Oracle. A execução deve ser feita pelo usuário/Gemini com comandos explícitos, preservando:

- working tree limpa;
- SHA conhecido;
- sem alteração de secrets;
- sem migrations;
- sem mudança de scheduler;
- sem deploy adicional;
- apenas os cenários controlados autorizados.

### Supabase

Durante diagnóstico, consultas devem ser read-only. Nenhuma migration, update/delete manual ou alteração de configuração é necessária para provar este plano, salvo descoberta técnica posterior documentada e autorizada separadamente.

### Sites públicos

Podem ser usados para conferência humana de um produto específico ou inconsistência visual. Não devem substituir a fonte oficial do runtime nas métricas do plano.

## 11. Evidência final que deve voltar para validação independente

Ao terminar todas as tasks, entregar um pacote textual sem segredos contendo:

- branch e HEAD SHA;
- `git status`;
- commits executados;
- lista de arquivos alterados;
- outputs completos dos testes direcionados;
- resultado de `npm run docs:audit` e validações do repositório;
- relatório API/source-first por marketplace;
- matriz por família: bruto -> filtrado -> classificado -> selecionado -> persistido;
- rejection reasons reconciliados;
- lista dos produtos persistidos no ciclo controlado;
- logs do ciclo Oracle com release SHA;
- consultas read-only do Supabase referentes ao correlation/cycle id;
- qualquer limitação ou task não executada;
- confirmação explícita: **nenhum merge para `main` realizado**.

A validação independente decide se o PR pode sair de draft/ser mergeado. Até essa validação, a implementação permanece isolada.