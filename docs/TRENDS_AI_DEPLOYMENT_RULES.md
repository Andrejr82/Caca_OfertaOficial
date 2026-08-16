# Tendências IA — Regras Definitivas de Implantação

Status: **regra de implantação**
Data: 2026-08-16

## 1. Objetivo

Transformar o Tendências IA em uma máquina de seleção comercial de produtos dos marketplaces, com o menor risco possível de instabilidade e sem sobrecarregar a Vercel Free.

Fluxo-alvo:

`marketplaces -> descoberta comercial -> matching -> score -> aprovação -> conteúdo/vídeo -> publicação -> métricas`

## 2. Arquitetura definitiva

### Oracle VPS
Responsável por processamento contínuo/pesado:
- descoberta/mineração de produtos e tendências dos marketplaces;
- execução do Radar/Tendências IA em lote;
- classificação IA em lote quando necessária;
- matching com catálogo/ofertas;
- cálculo de score e snapshot consolidado;
- workers pesados já existentes, incluindo vídeo;
- WhatsApp persistente.

### Supabase
Fonte única de estado:
- sinais e classificações;
- oportunidades;
- snapshots do Radar;
- ofertas e posts;
- video_jobs;
- click_events e sales;
- storage de mídia.

### Vercel
Somente camada leve/stateless:
- UI `/trends` e demais painéis;
- leitura dos snapshots prontos no Supabase;
- aprovação/rejeição manual;
- ações rápidas e pontuais;
- publicação HTTP stateless em Telegram/Meta;
- tracking `/api/go/...`.

## 3. Fonte de tendência comercial

Prioridade inicial:
1. Shopee;
2. Mercado Livre.

Google Trends **não é fonte principal do MVP**. Só poderá voltar no futuro como sinal complementar se provar valor comercial.

O Tendências IA deve procurar primeiro produtos/categorias em alta dentro dos marketplaces e depois aplicar filtros comerciais.

## 4. Regras de estabilidade

É proibido:
- criar segundo engine de Shopee/ML;
- criar scheduler concorrente na Vercel;
- duplicar lógica de score entre Oracle e Vercel;
- executar pipeline pesado síncrono em rota Vercel;
- alterar Shopee V1 operacional para atender o Tendências IA;
- alterar Top30/cenários/publicação atual sem task específica;
- criar estado paralelo fora do Supabase;
- avançar para uma task dependente de Oracle antes da atualização e validação definitiva da Oracle.

## 5. Regra de avanço por tasks

Cada task só inicia quando a anterior estiver **concluída, validada e reconciliada**.

Quando houver alteração necessária na Oracle:
1. preparar mudança no repositório;
2. validar localmente/testes;
3. executar atualização externa da Oracle usando o fluxo/arquivo `update-oracle` quando aplicável;
4. validar runtime Oracle;
5. confirmar versão/estado esperado;
6. somente então avançar.

Sem confirmação da etapa Oracle, a sequência fica bloqueada.

## 6. Sequência de implantação

### TASK 1 — Contrato e isolamento do runtime
Objetivo: consolidar o contrato Oracle/Supabase/Vercel do Tendências IA e remover dependência de execução pesada na Vercel.

Critério de conclusão:
- Vercel não executa o ciclo pesado do Radar;
- contratos de entrada/saída definidos;
- nenhum fluxo operacional atual alterado.

### TASK 2 — Engine comercial marketplace-first na Oracle
Objetivo: fazer o Radar consumir tendências/candidatos de Shopee e Mercado Livre, reutilizando os engines existentes.

Critério de conclusão:
- sem engine duplicado;
- sem scheduler novo concorrente;
- candidatos comerciais reais produzidos em modo seguro;
- Google Trends fora do caminho principal.

**Exige atualização Oracle antes de avançar.**

### TASK 3 — Matching e Commercial Opportunity Score
Objetivo: transformar candidatos em oportunidades comerciais ordenadas.

Entradas mínimas:
- força da demanda/tendência marketplace;
- qualidade do match;
- preço/competitividade;
- comissão potencial quando disponível;
- reputação/qualidade da oferta;
- potencial visual;
- histórico de clicks/sales quando houver.

Saída:
- `IGNORAR | TESTAR | PRIORIDADE`;
- score versionado;
- motivo auditável.

Critério de conclusão:
- matching conservador;
- sem fuzzy permissivo;
- score determinístico/versionado;
- snapshot persistido no Supabase.

**Se o runtime dessa etapa for alterado na Oracle, atualizar e validar Oracle antes de avançar.**

### TASK 4 — `/trends` como mesa de seleção comercial
Objetivo: Vercel apenas ler snapshot pronto e permitir decisão humana.

Mostrar no mínimo:
- produto;
- marketplace;
- tendência/demanda;
- preço;
- comissão potencial;
- score;
- canal recomendado;
- formato recomendado;
- motivo;
- ação `IGNORAR | APROVAR TESTE`.

Critério de conclusão:
- página rápida;
- nenhuma computação pesada no request;
- aprovação não publica automaticamente.

### TASK 5 — Encaminhamento para execução existente
Objetivo: conectar oportunidade aprovada aos fluxos existentes sem criar novo publicador.

Regras:
- vídeo -> fluxo `Vídeos de Ofertas`;
- oferta normal -> editorial/publicadores existentes;
- Oracle continua responsável pelos componentes persistentes/pesados já atuais.

Critério de conclusão:
- nenhuma duplicação de publicação;
- rastreabilidade da origem Tendências IA;
- nenhum impacto em Top30/WhatsApp/Telegram atuais sem regra explícita.

### TASK 6 — Métricas comerciais e decisão
Objetivo: medir resultado comercial da oportunidade.

Prioridade:
1. vendas;
2. comissão;
3. clique -> venda;
4. comissão por clique;
5. cliques/CTR como diagnóstico secundário.

Saída:
- `ESCALAR | AJUSTAR | ABORTAR`.

## 7. Regra de rollout

A ordem é obrigatória:

`contrato -> Oracle engine -> atualização Oracle -> validação Oracle -> matching/score -> UI -> encaminhamento -> métricas`

Nenhuma etapa posterior deve contornar uma pendência anterior.

## 8. Critério final de arquitetura

Arquitetura aprovada:

`Oracle = engine pesado/comercial`

`Supabase = estado único`

`Vercel = dashboard + ações leves`

Essa divisão deve ser preservada enquanto a conta Vercel permanecer no plano Free ou até revisão arquitetural explícita.
