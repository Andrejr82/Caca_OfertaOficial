# Mercado Livre Opportunity V1 — Plano de Tasks

Status: proposta para aprovação
Base oficial analisada: `main` @ `547a26851b73d33545fa7ff1cf7f34674f455b30`
Escopo: Radar de Tendências / Mercado Livre

## Objetivo

Transformar o Mercado Livre de preenchimento/monitoramento fraco em fonte real de oportunidades comerciais do Radar, sem repetir o ciclo longo de tuning ocorrido na Shopee.

Princípios:
- reutilizar a integração oficial Mercado Livre já existente;
- nenhuma métrica comercial inventada;
- nenhuma comissão presumida quando a API não fornecer comissão;
- novidade absoluta e integridade de preço preservadas;
- ranking determinístico, pequeno e testável;
- sem shadow prolongado: validar uma vez e substituir o comportamento ML atual;
- zero publicação automática;
- máximo global de 20 produtos no snapshot combinado;
- qualquer ação Oracle somente por prompt operacional após autorização.

## Baseline atual

O Radar chama `collectMercadoLivreMarketplaceCandidates` com apenas seis intenções padrão (`smart TV 4K`, `fone bluetooth`, `air fryer`, `notebook`, `tenis corrida`, `cadeira gamer`) e `maxPerIntent = 5`.

A integração oficial em `scripts/mercadolivre-official-intents-v5.cjs` já possui descoberta por domínio/categoria, aliases, highlights oficiais, catálogo oficial e deduplicação por item. O Radar atual subutiliza essa capacidade.

Na normalização atual do Radar, Mercado Livre recebe `commissionPercent: 0`. Comissão não pode ser tratada como sinal positivo até existir fonte oficial/contratual para esse dado.

## Task 1 — Discovery Pool ML amplo

### Objetivo

Parar de depender das seis keywords fixas e reutilizar a cobertura oficial existente para produzir um pool diversificado de candidatos Mercado Livre.

### Implementação
- reutilizar `SEARCH_ALIASES`, domínio/categoria e fluxo oficial existentes;
- usar conjunto compacto de intenções comerciais distribuído por macrogrupos;
- limitar chamadas e candidatos por intenção para manter execução rápida;
- deduplicar por identidade nativa (`itemId` / `productId` quando aplicável);
- preservar preço, preço anterior, desconto, imagem, link, categoria, produto e provenance;
- falha de uma intenção não aborta as demais;
- nenhuma alteração Shopee.

### Arquivos prováveis
- `scripts/mercadolivre-official-intents-v5.cjs`
- `scripts/oracle-trends-radar-engine.cjs` ou módulo ML extraído de forma mínima
- teste de arquitetura/regressão ML

### Aceite
- pool real significativamente maior que os 18 candidatos observados no baseline recente;
- pelo menos 5 macrogrupos quando a API fornecer cobertura suficiente;
- 0 duplicados nativos;
- 0 preços inválidos;
- nenhuma métrica inventada;
- tempo de execução compatível com o polling atual.

### Oracle

SIM. Após testes, fornecer prompt para dry-run real na Oracle. Não reiniciar serviço nesta task sem autorização explícita.

## Task 2 — Mercado Livre Opportunity Gate V1

### Objetivo

Selecionar oportunidades reais do Mercado Livre por evidência comercial, não por simples preenchimento de vagas.

### Sinais permitidos
- desconto real quando `oldPrice > currentPrice` e a autoridade do preço for válida;
- posição/evidência de highlights/catálogo oficial;
- histórico real de preço quando existir;
- histórico real de vendas somente quando a API fornecer quantidade comparável;
- qualidade/confiança dos dados;
- preço atual e faixa comercial;
- diversidade por produto, categoria/macrogrupo e identidade nativa.

### Regras
- `insufficient_history` não vira crescimento artificial;
- ausência de vendas não vira zero vendas;
- ausência de comissão não gera vantagem comercial;
- desconto sem preço anterior confiável não recebe score de oferta;
- produto comum sem evidência de oportunidade não entra só por ser conhecido/caro;
- no máximo 2 produtos funcionalmente equivalentes no Top 20 combinado;
- ML não tem cota mínima nem obrigação de completar 20.

### Implementação

Criar módulo pequeno e isolado, por exemplo `scripts/mercadolivre-opportunity-v1.cjs`, responsável por normalizar evidências, classificar oportunidade, pontuar com pesos fixos, aplicar gates de qualidade/diversidade e devolver produtos prontos para persistência.

Não reutilizar comissão Shopee nem inventar equivalente.

### Testes obrigatórios
- desconto verdadeiro supera produto sem oferta;
- desconto fabricado/sem old price não pontua;
- `insufficient_history` permanece neutro;
- produto sem vendas pode sobreviver por forte evidência de oferta, mas vendas não são inventadas;
- duplicado nativo não entra;
- equivalentes não dominam o ranking;
- ML não interfere no seletor Shopee V1.2.

### Aceite

Em um dry-run real: Top ML comercialmente explicável, nenhum produto dependente de dado inexistente para pontuar, nenhum `commissionPercent` usado como benefício sem fonte oficial, diversidade melhor que o baseline e zero publicação.

### Oracle

SIM. Fornecer prompt único para testes + 1 dry-run real. Sem tuning repetitivo: contratos passando e Top ML coerente encerram a task.

## Task 3 — Integração final no Radar

### Objetivo

Substituir o fallback ML atual pelo Opportunity Gate V1 e encerrar a frente Mercado Livre.

### Implementação
- integrar o novo seletor no `oracle-trends-radar-runner.cjs` após a Shopee V1.2;
- manter novidade absoluta antes da elegibilidade;
- combinar Shopee + ML por qualidade, respeitando máximo global de 20;
- não reservar cota fixa por marketplace;
- persistir `strategy_version` específico do ML;
- manter aprovação humana e publicação automática zero;
- se handoff afiliado ML continuar indisponível no runtime, exibir explicitamente `monitoramento`, sem fabricar link monetizado ou comissão.

### Dependência

A implementação deve partir da `main` atualizada contendo a Shopee V1.2 aprovada. O PR da Shopee não deve ser copiado manualmente para esta task.

### Validação final
- testes ML;
- regressão Radar;
- regressão Shopee V1.2;
- `git diff --check`;
- `npm run verify` quando dependências estiverem disponíveis;
- 1 E2E real na Oracle;
- 0 duplicados nativos;
- 0 preços inválidos;
- 0 publish calls;
- 0 posts writes;
- 0 offers writes automáticos.

### Oracle

SIM. Após aprovação técnica, fornecer prompt de ativação somente do `oracle-trends-radar`, com HEAD obrigatório, rollback e 1 E2E real. Nunca reiniciar `oracle-scraper` sem autorização específica.

## Ordem de execução

1. Task 1 — Discovery Pool amplo.
2. Task 2 — Opportunity Gate V1.
3. Task 3 — Integração + um único E2E final.

Cada task exige aprovação antes de implementação. Não abrir novas fases de tuning fora destes três blocos sem evidência objetiva de bug ou violação de contrato.

## Fora de escopo

- alterar Shopee V1.2;
- publicar automaticamente;
- inventar programa/comissão afiliada ML;
- migrations de produção;
- alterar credenciais/OAuth fora do necessário para usar a integração já existente;
- refatoração geral do Radar;
- novo daemon/scheduler;
- shadow prolongado ou múltiplas rodadas de ajuste subjetivo.
