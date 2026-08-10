# IA como camada de inteligência comercial — Caça Oferta Oficial

_Data de registro: 2026-08-10_

## Direção estratégica

A IA não deve ficar restrita à copy ou vídeo. O objetivo é evoluir o Caça Oferta Oficial de um sistema que **encontra ofertas e publica** para um sistema que **entende demanda → encontra produto → mede oportunidade → escolhe canal/formato → publica → aprende com o resultado**.

A direção observada em materiais recentes de Google, Salesforce e referências de ecommerce/retail aponta para agentes que descobrem, priorizam, recomendam e executam decisões comerciais. Usar IA só para copy aproveita apenas uma parte pequena desse potencial.

---

## Onde explorar IA no Caça Oferta

| Área | O que a IA faria | Valor |
|---|---|---|
| **Radar de tendências** | Detectar produtos/categorias crescendo em Google/YouTube/redes | Muito alto |
| **Score de oportunidade** | Cruzar tendência + desconto + comissão + cliques + vendas | Muito alto |
| **Seleção de ofertas** | Escolher quais ofertas realmente merecem publicação | Muito alto |
| **Canal ideal** | Decidir WhatsApp, Telegram, Instagram, Facebook etc. | Alto |
| **Formato ideal** | Escolher foto, carrossel ou vídeo | Alto |
| **Timing** | Determinar melhor horário/dia para cada categoria | Alto |
| **Personalização** | Aprender preferências por canal e audiência | Muito alto |
| **Copy** | Gerar texto adaptado ao canal/produto | Já usamos |
| **Vídeo** | Roteiro, narração, cortes, CTA | Alto |
| **Pós-análise** | Descobrir por que algo vendeu ou não vendeu | Muito alto |

---

## 1. Agente Radar de Produtos

Criar um agente para buscar sinais como:

- Google Trends;
- tendências de busca;
- produtos relacionados;
- crescimento de termos;
- sinais sociais;
- YouTube;
- TikTok;
- notícias/produtos quando relevante.

O objetivo não é apenas responder **“o que está viral”**, mas:

> **“O que está viral E nós temos uma boa oferta para vender?”**

Exemplo de saída:

```text
PRODUTO: Aspirador robô
TENDÊNCIA: +42%
VELOCIDADE: acelerando
REGIÃO: Brasil
DEMANDA: alta
OFERTAS DISPONÍVEIS: 17
MELHOR OFERTA: Shopee
OPORTUNIDADE: 91/100
```

Referência pesquisada:
- Google Search Central — Google Trends: https://developers.google.com/search/docs/monitor-debug/trends-start?hl=pt-br

---

## 2. Agente de Oportunidade Comercial

Esse agente seria um dos principais cérebros do sistema.

Ele deve cruzar sinais externos e internos para dar prioridade comercial às ofertas.

Exemplo conceitual:

```text
OPORTUNIDADE =
tendência
+ CTR histórico
+ conversão histórica
+ desconto real
+ comissão
+ reputação
+ preço competitivo
+ novidade
- saturação
```

Duas ofertas com o mesmo desconto podem receber scores completamente diferentes dependendo do potencial real de venda.

Sinais que podem compor o score:

- tendência atual;
- velocidade da tendência;
- CTR histórico;
- conversão histórica;
- desconto real;
- comissão;
- preço competitivo;
- reputação do produto/loja;
- novidade;
- saturação editorial;
- marketplace;
- canal;
- faixa de preço;
- categoria;
- desempenho histórico semelhante.

Referência pesquisada:
- Google Cloud Retail / Recommendations AI: https://docs.cloud.google.com/retail/docs/what-is-it?hl=pt-BR

---

## 3. Agente de aprendizado do próprio Caça Oferta

No longo prazo, essa pode ser uma das aplicações mais valiosas.

A IA deve aprender com dados reais do próprio projeto:

- `click_events`;
- `sales`;
- marketplace;
- categoria;
- preço;
- desconto;
- horário;
- canal;
- formato publicado;
- CTR;
- conversão;
- comissão.

Objetivo: descobrir padrões específicos do nosso público, por exemplo:

> “Ferramentas entre R$80–180 convertem melhor no WhatsApp.”

> “Eletrônicos acima de R$1.500 têm clique, mas pouca conversão.”

> “Shopee converte melhor produtos abaixo de R$150.”

Isso transforma IA genérica em **IA especializada no comportamento real dos usuários do Caça Oferta**.

Referência pesquisada:
- Shopify Enterprise — Personalization Trends: https://www.shopify.com/enterprise/blog/personalization-trends

---

## 4. Agente Editor

A grade editorial pode continuar existindo, mas a IA pode atuar depois das regras determinísticas para priorizar comercialmente as ofertas.

Exemplo:

```text
15:00 PET

Encontradas: 184 ofertas
Elegíveis: 71
Alta oportunidade: 12

IA selecionou:
7 Shopee
4 Mercado Livre
1 Amazon

Motivos:
tendência + preço + histórico + CTR + conversão
```

Princípio:

**A IA não substitui as regras.**

Ela entra **depois das regras**, fazendo ranking comercial entre ofertas já elegíveis.

---

## 5. Agente de Canal

Uma mesma oferta não precisa ser publicada em todos os lugares.

O agente pode decidir onde há maior probabilidade de performance.

Exemplo:

```text
Air Fryer R$299

Telegram: SIM
WhatsApp: SIM
Instagram: VÍDEO
Facebook: FOTO
TikTok: SIM
```

A decisão deve aprender com resultados reais por:

- canal;
- categoria;
- faixa de preço;
- formato;
- horário;
- CTR;
- vendas;
- comissão.

---

## 6. Agente de Conteúdo multimodal

A IA pode ir além da copy e decidir também o formato criativo.

Exemplo:

```text
PRODUTO: Furadeira

FORMATO:
Vídeo demonstrativo

GANCHO:
"Olha o que essa furadeira consegue fazer"

DURAÇÃO:
17 segundos

NARRAÇÃO:
SIM

CTA:
Preço + desconto + link
```

Possíveis decisões:

- foto;
- carrossel;
- vídeo curto;
- vídeo demonstrativo;
- vídeo narrado;
- gancho;
- duração;
- CTA;
- texto por canal.

Referência pesquisada:
- Google Cloud — AI trends in retail: https://cloud.google.com/resources/ai-trends-retail

---

## 7. Agentes especializados / Caçador de tendências

Arquitetura conceitual de agentes especializados:

```text
TrendAgent
 ├── Google Trends
 ├── YouTube
 ├── TikTok
 ├── buscas
 └── notícias/produtos

ShopeeAgent
 └── oportunidades Shopee

MercadoLivreAgent
 └── oportunidades ML

PerformanceAgent
 └── nossos cliques/vendas

OpportunityAgent
 └── cruza tudo

EditorialAgent
 └── decide publicação
```

Isso aproxima o projeto do conceito de **multi-agent systems** aplicado ao comércio.

Referência pesquisada:
- Google Cloud — Agentic AI in retail: https://cloud.google.com/transform/the-agentic-ai-revolution-reshaping-retail-and-consumer-interaction

---

## O que NÃO fazer

A IA não deve:

- inventar preço;
- decidir sozinha se um preço é válido sem dados verificáveis;
- ignorar histórico;
- substituir filtros determinísticos;
- inventar tendência baseada apenas na memória do LLM;
- publicar autonomamente desde o primeiro dia;
- transformar inferência em fato comercial.

Princípio central:

> A IA deve trabalhar sobre **dados e ferramentas**, não sobre “achismo” do modelo.

---

## Arquitetura conceitual

```text
       INTERNET / TENDÊNCIAS
               ↓
        Trend Intelligence
               ↓
MARKETPLACES → OFFER ENGINE
               ↓
          IA SCORING
               ↓
       Opportunity Ranking
               ↓
       Editorial Intelligence
          ↙      ↓      ↘
    WhatsApp Telegram Instagram
                         ↓
                    Foto/Vídeo
                         ↓
                      Venda
                         ↓
                click_events/sales
                         ↓
                 IA APRENDE
```

Objetivo: criar um **ciclo de aprendizado comercial**.

---

## Ordem de prioridade sugerida

1. **Radar de tendências**
2. **Opportunity Score**
3. **Performance Agent usando cliques/vendas**
4. **Seleção inteligente por canal**
5. **Escolha automática foto/vídeo**
6. **Otimização de horário/frequência**
7. **Agentes autônomos com limites**

---

## Insight de mercado pesquisado

Em pesquisa da Salesforce citada na análise:

- 39% dos consumidores pesquisados já usavam IA para descoberta de produtos em 2025;
- entre Gen Z, o número chegava a 54%;
- 75% dos varejistas pesquisados consideravam agentes de IA essenciais para competir.

Referência:
- Salesforce — AI Agent Retail Trends 2025: https://www.salesforce.com/news/stories/ai-agent-retail-trends-2025/?bc=OTH

---

# FASE 1 — MVP DE TENDÊNCIAS IA

## Decisão de escopo

Não implementar muitos agentes ou automações agora.

Os cenários editoriais existentes continuam rodando normalmente. A nova camada de IA nasce **paralela**, isolada e experimental.

Objetivo da Fase 1:

```text
DESCOBRIR TENDÊNCIA
        ↓
ENCONTRAR OFERTA COMPATÍVEL
        ↓
DECIDIR ONDE POSTAR
        ↓
DECIDIR COMO POSTAR
        ↓
PUBLICAR COMO EXPERIMENTO IDENTIFICADO
        ↓
MEDIR 7 DIAS
        ↓
ESCALAR / AJUSTAR / ABORTAR
```

## Página nova: Tendências IA

Criar uma nova página independente no dashboard, provisoriamente chamada **Tendências IA**.

Essa página será o centro operacional do experimento e deverá mostrar, por produto/oportunidade:

- produto/tendência;
- termo ou sinal de origem;
- força/velocidade da tendência;
- marketplace encontrado;
- oferta compatível;
- preço/desconto;
- score de oportunidade;
- canal sugerido;
- formato sugerido;
- justificativa curta da IA;
- status do experimento;
- data de início;
- janela de 7 dias;
- cliques;
- vendas;
- comissão;
- decisão final: `escalar`, `ajustar`, `abortar`.

## Vídeos permanecem separados

A página **Vídeos de Ofertas** continua sendo a área de produção/edição de vídeo.

Responsabilidades:

- **Tendências IA** decide **o que testar, onde e em qual formato**;
- **Vídeos de Ofertas** executa produção/edição quando o formato escolhido for vídeo.

Não duplicar editor de vídeo dentro da página Tendências IA.

## Capacidade mínima da IA na Fase 1

A IA precisa conseguir:

1. interpretar sinais de tendência provenientes de fontes verificáveis;
2. normalizar o produto/termo pesquisado;
3. comparar a tendência com ofertas reais já existentes no sistema;
4. recomendar a melhor oferta compatível sem inventar correspondência;
5. sugerir canal de publicação;
6. sugerir formato: foto, carrossel, vídeo ou oferta direta;
7. explicar em poucas linhas por que escolheu oferta/canal/formato;
8. registrar a hipótese do experimento;
9. analisar o resultado após 7 dias usando métricas reais;
10. recomendar `escalar`, `ajustar` ou `abortar`.

## IA como recomendação, não autoridade absoluta

Na Fase 1:

- nenhuma tendência pode ser inventada pelo LLM;
- toda tendência precisa de fonte/sinal verificável;
- nenhuma oferta pode ser criada ou associada por similaridade fraca;
- preço e desconto continuam sujeitos às regras determinísticas existentes;
- IA não altera os cenários editoriais existentes;
- IA não publica autonomamente sem o fluxo explicitamente aprovado;
- toda decisão precisa ser auditável.

## Registro do experimento

Cada publicação experimental deve carregar uma identificação estável, por exemplo:

```text
trend_experiment = 2026-08-w2
trend_opportunity_id = <uuid>
strategy_version = trend-v1
```

O objetivo é separar com clareza:

- publicação editorial normal;
- publicação orientada por tendência/IA.

Sem essa separação, a avaliação de 7 dias fica contaminada.

## Métricas de 7 dias

### Primárias

- vendas;
- comissão gerada;
- taxa clique → venda;
- comissão por clique;
- comissão por publicação experimental.

### Secundárias

- cliques;
- CTR quando alcance/impressões estiverem disponíveis;
- cliques por publicação;
- alcance;
- custo/esforço de produção.

### Dimensões de diagnóstico

- marketplace;
- categoria/produto;
- preço;
- desconto;
- canal;
- formato;
- horário;
- origem da tendência.

## Critério operacional após 7 dias

### ESCALAR

Há sinal comercial superior ao baseline e volume suficiente para justificar continuação.

### AJUSTAR

Há bons sinais de interesse, mas indícios de canal, formato, preço, timing ou seleção inadequados.

### ABORTAR

A tendência gera atenção sem monetização ou desempenho materialmente inferior ao baseline.

Sete dias são uma **janela operacional inicial**, não prova estatística definitiva. Amostras pequenas devem ser marcadas como inconclusivas.

## Ordem de implementação da Fase 1

### Etapa A — Estrutura primeiro

Antes de buscar tendências reais:

- definir domínio/modelos;
- definir estados e lifecycle;
- definir contrato da IA;
- definir fontes permitidas;
- definir persistência;
- criar página Tendências IA;
- preparar vínculo com ofertas existentes;
- preparar identificação experimental;
- preparar métricas de 7 dias.

### Etapa B — Primeiro radar real

Somente depois da estrutura:

- integrar uma fonte inicial de tendência;
- produzir oportunidades reais em modo observação;
- sem publicação automática.

### Etapa C — Experimento controlado

Selecionar poucas oportunidades, publicar de forma identificada e medir 7 dias.

### Etapa D — Decisão

Usar métricas reais para decidir:

- continuar;
- ajustar pesos/regras;
- mudar canal/formato;
- ou abortar a estratégia.

## Regra de implementação

**Não começar “na massa”.**

A primeira implementação deve montar a fundação para que IA, fontes, ofertas, canais, formatos e métricas sejam desacoplados e auditáveis.

Evitar neste momento:

- múltiplos agentes autônomos;
- dezenas de fontes externas;
- modelos preditivos complexos;
- alteração dos cenários editoriais existentes;
- publicação automática;
- otimização prematura.

---

## Visão final para o Caça Oferta Oficial

A evolução desejada é:

```text
ENTENDER DEMANDA
        ↓
ENCONTRAR PRODUTO
        ↓
MEDIR OPORTUNIDADE
        ↓
ESCOLHER CANAL
        ↓
ESCOLHER FORMATO
        ↓
PUBLICAR
        ↓
MEDIR CLIQUES/VENDAS
        ↓
APRENDER
        ↓
MELHORAR A PRÓXIMA DECISÃO
```

A aplicação de IA com maior potencial para o projeto não é simplesmente gerar mais conteúdo.

É transformar o Caça Oferta Oficial em um sistema de **inteligência comercial orientado por dados**, em que IA ajuda a decidir:

- o que vender;
- quando vender;
- onde publicar;
- em qual formato;
- com qual prioridade;
- com base em quais sinais;
- e o que aprender após cada clique e venda.
