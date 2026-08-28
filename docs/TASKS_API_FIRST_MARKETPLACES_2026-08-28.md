# Tasks executáveis — API-first marketplaces

Branch obrigatória: `docs/api-first-marketplace-validation-plan`

Regra: **não mergear na `main` até a auditoria final do usuário + ChatGPT**.

Cada task deve terminar com evidência objetiva. Não marcar task como concluída apenas porque o código foi alterado.

## TASK 0 — Preparação e baseline

Objetivo: congelar o estado inicial e impedir mistura de mudanças.

Checklist:

- [ ] confirmar branch atual = `docs/api-first-marketplace-validation-plan`;
- [ ] confirmar ancestral/base = `main@1bf08df46b7aafd897af2e88ed327b1a15937f2d` ou registrar divergência se a `main` avançou antes da execução;
- [ ] `git status` limpo antes de iniciar;
- [ ] registrar Node/npm usados;
- [ ] registrar variáveis de feature flags relevantes sem imprimir segredos;
- [ ] localizar os componentes reais de discovery/filtro/classificação/ranking/persistência de ML, Shopee e Amazon;
- [ ] não criar serviços novos.

Evidência obrigatória:

- branch;
- SHA inicial;
- lista dos arquivos/componentes responsáveis pelo funil.

## TASK 1 — Probe API-first do Mercado Livre

Objetivo: descobrir o que a API realmente retorna antes dos filtros.

Executar com as credenciais já existentes, usando o mesmo fluxo/autenticação do projeto.

Para `informatica_editorial`, consultar cada família planejada e registrar:

- família canônica;
- alias/termo;
- endpoint/rota lógica utilizada;
- offset;
- total bruto da página;
- IDs/títulos amostrados;
- `domain_id`;
- `category_id`;
- preço;
- evidência comercial disponível;
- erro HTTP/API, se houver.

Requisitos:

- [ ] não persistir ofertas durante o probe;
- [ ] não imprimir token;
- [ ] provar se offsets 0/30/60/90 são alcançados quando a página bruta está cheia;
- [ ] provar quais famílias retornam produtos e quais retornam zero;
- [ ] provar quantos candidatos são eliminados antes do primeiro contador oficial do funil.

Artefato sugerido: relatório JSON/Markdown versionado ou gerado em `reports/` sem segredos.

## TASK 2 — Probe API-first da Shopee

Objetivo: medir volume, cobertura de fontes e vazamentos antes da persistência.

Auditar o conjunto oficial usado pelo runtime, incluindo as fontes realmente ativas.

Registrar:

- origem/fonte;
- ProductCatId quando aplicável;
- família/intenção;
- título;
- preço/desconto;
- rating;
- vendas;
- comissão;
- categoria;
- link/identidade;
- decisão do filtro semântico.

Requisitos:

- [ ] comparar volume por fonte;
- [ ] detectar duplicação entre fontes;
- [ ] identificar mouse/teclado dominantes;
- [ ] marcar casos de caneta 3D, filamento, peças, kits, suportes e acessórios;
- [ ] não reduzir fontes já validadas sem prova de que são prejudiciais.

## TASK 3 — Probe/diagnóstico Amazon

Objetivo: provar que o volume é suficiente e localizar perdas posteriores.

Registrar por intenção:

- volume coletado;
- título;
- preço;
- rating/reviews;
- browse/category evidence;
- score inicial;
- decisão de aderência;
- decisão de acessório;
- classificação;
- score final;
- posição/fila final.

Casos obrigatórios de regressão:

- suporte para notebook;
- suporte para SSD;
- kit de limpeza;
- enrolador/organizador de cabos;
- webcam para notebook;
- mini PC com SSD;
- scanner ambíguo;
- switch ambíguo.

## TASK 4 — Instrumentação da matriz de perdas

Objetivo: nenhum produto pode desaparecer silenciosamente.

Implementar/reutilizar contadores existentes para fechar:

`bruto -> parse -> semântica -> produto principal -> novidade -> quality -> classificação -> ranking/diversidade -> fila -> RPC -> insert/update/ignore/fail`

Requisitos:

- [ ] contador por etapa;
- [ ] motivo por rejeição;
- [ ] contador por família;
- [ ] contador por query/alias onde aplicável;
- [ ] contagem de descartes pré-funil ML;
- [ ] soma matemática fechando entre entradas e saídas;
- [ ] sem alteração de banco apenas para telemetria se logs/metadata existentes forem suficientes.

Teste obrigatório: um fixture com perdas conhecidas deve fechar 100% da contabilidade.

## TASK 5 — Golden set compartilhado

Objetivo: bloquear regressões reais.

Criar golden set mínimo de 60 casos:

- 20 Amazon;
- 20 Mercado Livre;
- 20 Shopee.

Classes:

- `MUST_ACCEPT`;
- `MUST_REJECT`;
- `AMBIGUOUS_REVIEW`.

Incluir títulos reais dos ciclos/probes sempre que possível.

Casos MUST_REJECT obrigatórios:

- suporte para notebook;
- suporte para SSD;
- adaptador para SSD;
- kit de limpeza eletrônico;
- enrolador de cabo;
- filamento 3D;
- peça/reposição;
- produto fora do nicho com palavra secundária relevante.

Casos MUST_ACCEPT obrigatórios:

- notebook real;
- monitor real;
- SSD real;
- roteador real;
- webcam real;
- mini PC real;
- impressora/multifuncional real;
- nobreak real;
- switch de rede real.

## TASK 6 — Produto principal e acessórios

Objetivo: eliminar falsos positivos antes do ranking.

Corrigir somente componentes existentes.

Requisitos:

- [ ] produto principal vence palavra secundária;
- [ ] `Webcam ... Notebook` não vira notebook;
- [ ] `Mini PC ... SSD` não vira SSD;
- [ ] `Suporte para notebook` não vira notebook;
- [ ] `Adaptador para SSD` não vira SSD;
- [ ] `Filamento/caneta 3D` não vira impressora sem evidência real;
- [ ] `allowAccessory` não libera cenário inteiro;
- [ ] intenção explicitamente acessória continua possível quando o catálogo realmente pedir acessório.

Executar golden set após a mudança.

## TASK 7 — Mercado Livre: cobertura, profundidade e diversidade

Objetivo: resolver o gargalo de busca real do ML.

Requisitos de busca:

- [ ] certified-first preservado;
- [ ] Core/Expansion editorial preservado;
- [ ] exploração não certificada continua estrita;
- [ ] paginação decide continuidade por volume bruto;
- [ ] offsets seguros realmente executados;
- [ ] aliases por família registrados;
- [ ] erros por família visíveis;
- [ ] nenhum fallback aberto sem guardrails;
- [ ] domínio proibido continua bloqueado.

Requisitos de diversidade:

- [ ] descobrir se outras famílias tinham candidatos válidos no mesmo ciclo;
- [ ] se existirem, impedir que 5 vagas sejam ocupadas pela mesma família apenas por ordem/ranking;
- [ ] não preencher com família fraca apenas para atingir diversidade.

Critério: a seleção final deve refletir o pool real, não uma cota cega.

## TASK 8 — Shopee: semântica e diversidade

Objetivo: preservar volume e remover ruído.

Requisitos:

- [ ] manter ProductCatIds/fontes oficiais ativas;
- [ ] bloquear peças, acessórios e consumíveis fora de intenção;
- [ ] tratar 3D corretamente;
- [ ] impedir classificação por palavra secundária;
- [ ] deduplicar entre fontes;
- [ ] aplicar diversidade no ponto correto antes da persistência;
- [ ] impedir domínio de mouse/teclado quando outras famílias fortes existirem;
- [ ] preservar 0 padding artificial.

## TASK 9 — Amazon: aderência, classificação e ranking

Objetivo: fazer o alto volume resultar em seleção útil.

Requisitos:

- [ ] filtro específico de scanner;
- [ ] filtro específico de switch de rede;
- [ ] acessórios conhecidos rejeitados;
- [ ] classe principal correta;
- [ ] score legado não domina ranking;
- [ ] sinais comerciais confiáveis ganham peso;
- [ ] preço absurdo/sem vantagem real não sobe apenas por score antigo;
- [ ] diversidade por família respeita pool real.

## TASK 10 — Testes locais completos

Executar explicitamente e registrar saída.

No mínimo:

- [x] `product-title-quality`;
- [x] classificação;
- [x] Amazon curation;
- [x] Mercado Livre domain/category search;
- [x] Mercado Livre canonical classifier;
- [x] commercial niche runtime/coverage;
- [x] Shopee semântica/controlled persist aplicável;
- [x] golden set;
- [x] testes de diversidade se alterada;
- [ ] `npm run verify` se compatível com o estado do repositório;
- [x] `npm run docs:audit` se aplicável.

Não declarar testes não executados.

## TASK 11 — Comparação API bruta x funil corrigido

Objetivo: provar o efeito antes da Oracle.

Checklist de controle:

- [x] identificação da task e relatório versionado;
- [x] implementação/execução da comparação determinística;
- [x] validação do golden set;
- [x] revisão dos arquivos alterados;
- [x] critério de explicação de 100% da amostra confirmado;
- [x] ranking completo com intenção canônica propagada e seleção/fila executados por marketplace;
- [x] atualização final da task para `[x]` após todos os critérios.

Para cada marketplace produzir:

- total bruto;
- total por família;
- accepted/rejected;
- motivos;
- classificados;
- ranked;
- selecionados;
- famílias representadas;
- exemplos de falso positivo eliminado;
- exemplos de bom produto preservado.

Critério obrigatório: explicar 100% dos candidatos da amostra.

## TASK 12 — Revisão de diff antes da Oracle

Checklist:

- [x] nenhuma credencial adicionada ao Git;
- [x] nenhuma alteração manual de Supabase;
- [x] documentação atualizada se o runtime mudou;
- [x] validações de integridade (`git diff --check`, ESLint direcionado e `docs:audit`) passaram;
- [ ] nenhuma arquitetura paralela criada;
- [ ] nenhuma mudança de publicação/social não relacionada;
- [ ] nenhuma mudança de scheduler não relacionada;
- [ ] nenhuma flag nova sem necessidade comprovada;
- [ ] diff limitado às causas comprovadas;

## TASK 13 — ORACLE: alinhamento controlado

**Só executar com autorização explícita do usuário.**

Não improvisar comandos.

Antes do ciclo:

- [ ] registrar `main` e branch SHA;
- [ ] confirmar working tree limpa;
- [ ] alinhar pelo procedimento operacional autorizado;
- [ ] confirmar `.runtime-release.json`;
- [ ] confirmar PM2 online;
- [ ] confirmar SHA esperado.

Não alterar `.env.local` sem motivo e autorização.

## TASK 14 — ORACLE: ciclo controlado de `informatica_editorial`

Executar somente um ciclo.

Coletar:

- cycle/correlation id;
- release SHA;
- funil Amazon;
- funil ML;
- funil Shopee;
- classification coverage;
- rejection reasons;
- famílias/queries/offsets;
- insert/update/ignore/fail;
- readiness/first discovery warnings.

## TASK 15 — Supabase pós-ciclo

Consulta somente de validação.

Para o correlation id do ciclo:

- [ ] listar ofertas afetadas;
- [ ] marketplace;
- [ ] título;
- [ ] família/classificação;
- [ ] status;
- [ ] insert/update;
- [ ] score/evidências se persistidas;
- [ ] confirmar se acessórios indevidos chegaram ao banco;
- [ ] confirmar diversidade real.

Não editar linhas para “corrigir” resultado.

## TASK 16 — Critério final por marketplace

### ML

- [ ] sem colapso de classificação;
- [ ] famílias pesquisadas rastreáveis;
- [ ] paginação rastreável;
- [ ] zero sumiço silencioso;
- [ ] diversidade compatível com pool;
- [ ] zero acessório proibido persistido.

### Shopee

- [ ] volume preservado;
- [ ] sem vazamento 3D/acessório conhecido;
- [ ] diversidade compatível com pool;
- [ ] dedup entre fontes funcionando;
- [ ] persistência funcional.

### Amazon

- [ ] volume preservado;
- [ ] acessórios conhecidos bloqueados;
- [ ] classificação principal correta;
- [ ] ranking melhor;
- [ ] diversidade compatível com pool;
- [ ] persistência funcional.

## TASK 17 — Handoff final para auditoria

Entregar ao usuário, sem merge:

1. branch final;
2. SHA final;
3. PR, se aberto, ainda não mergeado;
4. todos os arquivos alterados;
5. resumo de cada task;
6. testes e saídas;
7. probes das APIs;
8. golden set;
9. matriz de perdas;
10. cobertura por família;
11. logs Oracle;
12. correlation id;
13. consulta pós-ciclo;
14. baseline x resultado novo;
15. riscos residuais;
16. confirmação: `MAIN_MERGED=NO`.

Somente após a auditoria final deve existir autorização para merge.
