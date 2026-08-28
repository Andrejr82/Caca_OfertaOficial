# Plano mestre — API-first para busca, filtros e qualidade dos marketplaces

Data: 28/08/2026
Branch de trabalho: `docs/api-first-marketplace-validation-plan`
Base inicial: `main@1bf08df46b7aafd897af2e88ed327b1a15937f2d`

## 1. Objetivo

Eliminar de forma mensurável os problemas recorrentes de descoberta, classificação, filtros, ranking e diversidade em Mercado Livre, Shopee e Amazon.

O princípio central é simples: **API primeiro, código depois**.

A correção só pode ser considerada concluída quando for possível provar, com dados reais de entrada e saída, onde cada candidato foi aceito ou rejeitado em todo o funil:

`API bruta -> normalização -> aderência semântica -> produto principal -> qualidade -> identidade/novidade -> classificação -> ranking -> diversidade -> fila -> persistência`

Não criar um motor paralelo, serviço novo ou arquitetura nova. Corrigir e instrumentar os componentes existentes.

## 2. Regra de execução e merge

Todo o trabalho deve permanecer nesta branch separada até a validação final.

Proibido durante a implementação:

- mergear na `main` antes da auditoria final;
- alterar Oracle sem etapa explícita de validação;
- alterar credenciais ou segredos;
- alterar Supabase manualmente para mascarar resultados;
- preencher metas de volume com produto fraco;
- substituir API oficial por scraping/site como fonte primária de diagnóstico;
- criar outro mecanismo de discovery quando já existe componente equivalente.

O merge só ocorre quando:

1. testes locais relevantes estiverem verdes;
2. GitHub Actions aplicáveis estiverem verdes;
3. os resultados brutos das APIs tiverem sido comparados ao funil;
4. o ciclo controlado na Oracle provar melhora real;
5. a persistência no Supabase confirmar os resultados;
6. nenhuma regressão grave surgir em outro marketplace;
7. a auditoria final aprovar o diff e as evidências.

## 3. Fonte de verdade por marketplace

### Mercado Livre

Fonte primária: API oficial do Mercado Livre usando as credenciais já existentes do runtime.

Devem ser analisados, quando disponíveis no fluxo atual:

- resultados de busca oficial;
- `domain_id` e `category_id`;
- título;
- preço atual;
- vendedor/loja oficial quando disponível;
- frete/logística quando disponível;
- sold quantity, reputação ou evidência comercial quando o endpoint atual fornecer;
- paginação e offsets realmente consultados;
- termos/famílias pesquisados;
- erros por endpoint/família.

O site do ML pode ser usado apenas como conferência manual/visual. Não deve ser a fonte primária para decidir se o runtime encontra ou não produtos.

### Shopee

Fonte primária: OpenAPI/afiliados já utilizada pelo projeto, com as credenciais do runtime.

Devem ser preservados e auditados os conjuntos existentes, incluindo quando aplicável:

- ProductCatIds;
- productOffers;
- DELTA;
- shopOfferV2;
- shopeeOfferV2;
- rating;
- vendas;
- preço/desconto;
- comissão;
- imagem/link técnico;
- categoria;
- origem do item.

Não reduzir a validação a uma única fonte se o runtime oficial já combina mais de uma.

### Amazon

A coleta atual já demonstra alto volume. O foco principal é provar que o problema está depois da coleta.

Devem ser preservados e auditados:

- termo/intenção de busca;
- título;
- preço;
- rating/reviews;
- evidências comerciais disponíveis;
- browse/category evidence;
- aderência do título à intenção;
- rejeições de acessórios;
- classificação final;
- score/ranking;
- motivo de entrada ou saída da fila.

## 4. Conhecimento já comprovado

### 4.1 Mercado Livre

Ciclo controlado anterior em `informatica_editorial`:

- 5 candidatos finais;
- 5 classificados;
- 0 `unknown`;
- 0 `review_required`;
- 5 persistidos;
- todos os 5 eram roteadores.

Conclusão: a cobertura de classificação melhorou fortemente, mas a descoberta/diversidade ainda ficou insuficiente.

O log também mostrou diferença entre o resultado de `ML_official_intents` e o início do funil instrumentado. Portanto é obrigatório contar candidatos descartados antes do primeiro contador formal do funil.

O PR #187 já corrigiu o encerramento prematuro da paginação quando o sistema usava a quantidade pós-filtro para decidir se deveria continuar. O comportamento esperado agora é usar o tamanho bruto retornado pela API e poder aprofundar offsets seguros existentes.

### 4.2 Shopee

Já houve validação com grande volume bruto e boa precisão semântica, mas o ciclo produtivo mostrou:

- grande volume encontrado;
- boa persistência;
- concentração excessiva em algumas famílias;
- vazamentos como produtos de impressão/caneta 3D e itens ambíguos;
- repetição de mouse/teclado.

Conclusão: a Shopee não sofre principalmente de falta de volume. O problema dominante é qualidade semântica, produto principal, diversidade e seleção final.

### 4.3 Amazon

Ciclos recentes mostraram centenas de candidatos antes da fila.

Problemas observados:

- acessórios sobrevivendo;
- suporte/kit de limpeza/organizador de cabo competindo como produto principal;
- classificações erradas por palavras secundárias;
- score legado favorecendo candidatos inadequados;
- preço baixo ou score de coleta influenciando demais a seleção.

Conclusão: a Amazon tem volume. O problema dominante é filtro, classificação, ranking e diversidade.

## 5. Métrica obrigatória: matriz de perdas do funil

Para cada marketplace e família, gerar uma tabela equivalente a:

| Etapa | Entraram | Saíram | Motivos principais |
|---|---:|---:|---|
| API bruta | N | - | - |
| Parse/normalização | N | X | dados inválidos |
| Aderência semântica | N | X | intenção incompatível |
| Produto principal | N | X | acessório/peça/consumível |
| Identidade/novidade | N | X | repetido/conhecido |
| Quality gate | N | X | rating/preço/dados comerciais |
| Classificação | N | X | unknown/review/conflict |
| Ranking/diversidade | N | X | limite/família/score |
| Persistência | N | X | insert/update/ignore/fail |

A soma das perdas precisa fechar matematicamente. Nenhum candidato pode “sumir” entre etapas sem contador/motivo.

## 6. Métrica obrigatória: cobertura por família

Para cada nicho, medir:

- famílias planejadas;
- famílias realmente consultadas;
- famílias com resposta da API;
- famílias com zero resultados;
- famílias com erro;
- famílias com produto válido;
- famílias que chegaram à fila;
- famílias persistidas.

Para `informatica_editorial`, observar especialmente:

- notebook;
- monitor;
- SSD/NVMe;
- impressora/multifuncional;
- roteador;
- mini PC/computador/desktop;
- teclado;
- mouse;
- webcam;
- HD externo;
- scanner;
- nobreak;
- switch de rede;
- demais famílias Core/Expansion já existentes no contrato.

Não fixar artificialmente a carteira a uma lista menor do que o catálogo editorial existente.

## 7. Regras de qualidade compartilhadas

### Produto principal

A classe principal deve ser determinada pelo objeto vendido, não por uma palavra secundária.

Exemplos obrigatórios:

- `Webcam ... para Notebook` -> webcam;
- `Mini PC ... SSD` -> mini PC/computador;
- `Suporte para notebook` -> acessório, não notebook;
- `Adaptador para SSD` -> acessório, não SSD;
- `Kit de limpeza para eletrônicos` -> acessório/consumível;
- `Filamento para caneta 3D` -> consumível, não impressora;
- `Caneta 3D` -> não classificar como impressora apenas pela palavra “impressora”.

### Acessórios

Não permitir `allowAccessory=true` como liberação de um cenário inteiro.

Acessório só pode ser aceito quando a própria intenção editorial for explicitamente acessória e compatível com o nicho.

### Ranking

O ranking não pode permitir que score legado de coleta compense classe errada ou produto acessório.

Ordem conceitual:

1. produto correto;
2. intenção correta;
3. integridade dos dados;
4. qualidade comercial;
5. confiança/reputação;
6. desconto/economia real;
7. logística;
8. diversidade;
9. score auxiliar de coleta.

## 8. Mercado Livre — solução alvo

### 8.1 Busca

- executar famílias certificadas primeiro;
- manter catálogo editorial Core/Expansion existente;
- para famílias sem mapa certificado, usar apenas a busca oficial estrita já existente;
- aprofundar paginação enquanto houver página bruta cheia e orçamento seguro;
- registrar offsets consultados;
- registrar alias/termo usado;
- registrar número bruto e número aceito por página;
- não interromper busca porque poucos sobreviveram ao filtro;
- não abrir fallback sem guardrails.

### 8.2 Telemetria

Para cada query registrar pelo menos:

- cenário;
- família canônica;
- termo/alias;
- rota/endereço lógico do endpoint;
- offset;
- total bruto retornado;
- aceitos;
- rejeitados;
- motivo dos rejeitados;
- erros;
- domínio/categoria quando presente.

### 8.3 Critério de diversidade

Não considerar bom um ciclo em que várias famílias foram pesquisadas mas a fila final tem somente uma família, salvo se os dados brutos provarem que as demais realmente não produziram candidatos elegíveis.

Se 5 roteadores vencerem porque nenhuma outra família tem candidato válido, isso é aceitável. Se outras famílias tinham produtos melhores e foram descartadas por bug de busca/filtro/ranking, é falha.

## 9. Shopee — solução alvo

### 9.1 Busca

Preservar o conjunto oficial já validado e evitar regressões no volume.

### 9.2 Filtro semântico

Bloquear:

- acessórios que tentam se passar pelo produto principal;
- peças;
- kits de manutenção;
- consumíveis;
- produtos de família diferente por palavra ambígua;
- itens 3D que não sejam a classe editorial realmente buscada.

### 9.3 Diversidade

Aplicar diversidade antes da persistência final usando os mecanismos existentes.

A fila não deve ficar dominada por dezenas de variantes de mouse/teclado quando existem outras famílias válidas e comercialmente competitivas.

Não impor diversidade artificial se as outras famílias forem fracas.

## 10. Amazon — solução alvo

### 10.1 Aderência da busca

Criar/fortalecer regressões para termos ambíguos, por exemplo:

- scanner;
- switch de rede;
- monitor;
- SSD;
- webcam;
- notebook;
- mini PC.

### 10.2 Filtro de acessório

Cobrir explicitamente padrões que já vazaram:

- enrolador/organizador de cabo;
- suporte de parede;
- suporte para notebook;
- suporte para SSD;
- kit de limpeza;
- adaptador;
- case;
- cabo;
- peça/reposição;
- consumível.

### 10.3 Ranking

Validar que produtos principais com boa evidência comercial superem acessórios e produtos absurdamente caros/sem vantagem real.

## 11. Golden set obrigatório

Criar amostras versionadas por marketplace com três classes:

1. **MUST_ACCEPT** — produto principal inequívoco e compatível;
2. **MUST_REJECT** — acessório, peça, classe errada ou intenção incompatível;
3. **REVIEW/AMBIGUOUS** — casos que exigem evidência adicional.

Amostra mínima inicial:

- 20 casos Amazon;
- 20 casos Mercado Livre;
- 20 casos Shopee;
- incluindo todos os exemplos reais que já falharam em produção.

O golden set não deve conter apenas exemplos artificiais. Priorizar títulos reais observados nos ciclos e na API.

## 12. Testes obrigatórios

Antes de qualquer ciclo Oracle:

- testes de `product-title-quality`;
- testes de classificação;
- testes de curation/quality gate;
- testes específicos ML de paginação e fallback;
- testes de plano de nicho/commercial runtime;
- testes Shopee de filtro semântico/controlled persist;
- testes de diversidade/queue se o componente existente for alterado;
- golden set.

Não declarar “testado” algo que não foi executado.

## 13. Validação API-first antes da Oracle

Executar probes controlados contra as APIs reais usando as credenciais existentes, sem persistir no Supabase.

Para cada marketplace:

1. escolher `informatica_editorial` como cenário inicial;
2. executar famílias individualmente;
3. salvar amostra bruta;
4. rodar o mesmo dado pelo funil local;
5. produzir matriz de perdas;
6. comparar esperado x efetivo;
7. corrigir;
8. repetir até os erros conhecidos desaparecerem.

Segredos nunca devem ser impressos nos relatórios.

## 14. ORACLE — etapa separada e somente após validação local/API

A Oracle entra apenas quando:

- branch estiver tecnicamente estável;
- testes locais estiverem verdes;
- probes API-first estiverem aprovados;
- diff estiver revisado.

Fluxo correto:

1. manter branch separada;
2. alinhar temporariamente a Oracle à branch apenas se o procedimento operacional adotado permitir e houver autorização explícita; ou usar o método de teste aprovado pelo projeto;
3. executar **um único ciclo controlado de `informatica_editorial`**;
4. coletar logs completos;
5. consultar Supabase somente para validar o que foi persistido;
6. comparar com baseline;
7. voltar/corrigir na branch se necessário;
8. não mergear enquanto houver falha relevante.

## 15. Critérios de aceite do ciclo final

### Mercado Livre

Obrigatório:

- todas as famílias planejadas reportadas como consultadas, puladas ou falhas com motivo;
- paginação comprovável por telemetria quando necessária;
- nenhum candidato desaparece sem motivo;
- classificação sem colapso semelhante a 7 -> 1;
- diversidade maior que uma família quando os dados brutos oferecerem candidatos válidos em outras famílias;
- zero acessório proibido persistido;
- persistência funcional.

### Shopee

Obrigatório:

- volume de busca não regredir injustificadamente;
- zero peça/acessório/consumível proibido persistido no golden set e na amostra final;
- diversidade compatível com o pool real;
- sem concentração artificial quando outras famílias fortes existirem;
- persistência funcional.

### Amazon

Obrigatório:

- centenas de candidatos continuam sendo processados quando a API fornecer esse volume;
- acessórios conhecidos não entram na fila final;
- classificações secundárias incorretas eliminadas;
- produtos principais comercialmente fortes superam acessórios e ruído;
- persistência funcional.

## 16. Relatório final obrigatório

O executor deve entregar:

- branch e SHA final;
- lista de arquivos alterados;
- resumo por task;
- comandos de teste executados;
- saída dos testes;
- relatório das probes API-first;
- matriz de perdas por marketplace;
- cobertura por família;
- exemplos MUST_ACCEPT/MUST_REJECT;
- ciclo Oracle controlado, se autorizado;
- correlation/cycle id;
- contadores finais;
- produtos persistidos por marketplace;
- comparação baseline x novo;
- riscos residuais;
- confirmação explícita de que a `main` ainda não foi mergeada durante a execução.

## 17. Regra de decisão final

O trabalho não é aprovado porque “o código parece correto”.

É aprovado somente quando:

- a API prova que a busca tem cobertura suficiente;
- o funil explica todas as perdas;
- os filtros rejeitam os produtos ruins conhecidos;
- o ranking seleciona produto principal e comercialmente defensável;
- a diversidade respeita o pool real;
- a persistência confirma o resultado;
- e a auditoria final não encontra regressão relevante.
