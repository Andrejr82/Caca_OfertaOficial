# 🎯 Shopee Open API: Análise Profunda e Oportunidades

A documentação revelou o potencial total da **API de Afiliados da Shopee**. Nós já estávamos utilizando a ponta do iceberg com a query `productOfferV2` (que acabamos de consertar com o `itemId`), mas a Shopee liberou diversas novas ferramentas, métricas vitais e estratégias de *Data Feed*.

Abaixo estruturei a documentação da API em um formato limpo e cruzei com a nossa arquitetura atual da **Oracle** e da **Publicação Expressa**, mostrando o que ganhamos e o que podemos melhorar.

---

## 1. Estrutura da Open API da Shopee (GraphQL)

A API da Shopee baseia-se em GraphQL, rodando sob um limite de requisições de **8000 vezes/hora**, exigindo cabeçalho de autenticação com assinatura HMAC-SHA256 (`AppId`, `Timestamp`, `Payload`, `Secret`).

### A. Queries de Extração de Produtos (Ofertas)
- **`productOfferV2` (O que usamos agora):** Focada na extração de produtos específicos ou buscas. 
  - **Novidades Notáveis:** 
    - `itemId` e `shopId` (a chave que usamos para salvar o sistema!).
    - `ratingStar` (Nota do produto, ex: "4.7").
    - `sales` (Quantidade de vendas).
    - `priceDiscountRate` (% de Desconto oficial).
    - Separação entre `shopeeCommissionRate` e `sellerCommissionRate` (Comissão Xtra).
- **`shopeeOfferV2` e `shopOfferV2`:** Voltadas para obter listas de campanhas da própria Shopee ou de lojas específicas. Útil para descobrir Lojas Oficiais (`shopType: [1]`) ou Vendedores Indicados.

### B. Queries de Sincronização em Massa (Catálogo Feed) 🔥 NOVIDADE
- **`listItemFeeds` e `getItemFeedData`:** 
  - Permitem o download de arquivos gigantescos com o **catálogo completo** (`FULL`) ou apenas os produtos adicionados/atualizados hoje (`DELTA`). 
  - Em vez de buscar produto a produto, isso permite que a Oracle "sugue" uma categoria inteira da Shopee para dentro do banco de dados de uma vez só!

### C. Mutations de Links Curtos
- **`generateShortLink`:** 
  - Recebe a URL original e os `subIds` (UTMs para rastreio) e devolve a URL encurtada oficial diretamente.

### D. Relatórios de Performance (Conversão)
- **`conversionReport` e `validatedReport`:**
  - Permite baixar o histórico de cliques, vendas e relatórios de fraudes (`fraudStatus`).
  - Indica o tipo de comprador (`buyerType`: NEW ou EXISTING).

---

## 2. Diagnóstico do Fluxo Atual (Oracle / Caça Ofertas)

Hoje, o fluxo da **Publicação Expressa** faz o seguinte:
1. Recebe um link.
2. Resolve o redirecionamento.
3. Extrai o `shopId` e `itemId`.
4. Chama a Oracle (ou faz o *fallback* no Front) via `productOfferV2` para capturar Título, Preço, Foto e Comissão.

**Nossas Limitações Atuais:**
- A Publicação Expressa hoje só processa a extração básica para a geração do post e da imagem.
- A Oracle usa *scraping* híbrido (GraphQL + HTML), focado estritamente em descobrir a oferta pontual.
- Nós dependemos muito do usuário colar o link manualmente.

---

## 3. Oportunidades de Ouro (O Que Podemos Melhorar)

Com base no que descobrimos, **encontramos exatamente o que precisamos para escalar o sistema**. Aqui estão as melhorias que não afetam o fluxo atual, mas elevam a plataforma a outro patamar:

> [!TIP]
> **1. Enriquecimento dos Posts da Publicação Expressa**
> A API `productOfferV2` retorna `ratingStar` (avaliação) e `sales` (vendas). Podemos passar a injetar na Copy gerada por IA dados reais de "Prova Social":
> *Exemplo gerado:* "⭐ Avaliação 4.8 | 🔥 Mais de 5 mil vendidos!"

> [!IMPORTANT]
> **2. Encurtador Nativo sem Depender de Painel**
> A mutation `generateShortLink` nos permite aposentar qualquer encurtador paralelo. Ao colar um link longo da Shopee, o próprio back-end da Publicação Expressa pode usar a Open API para gerar o link curto dinamicamente com os Sub-IDs do afiliado injetados automaticamente.

> [!NOTE]
> **3. A Mina de Ouro: Sincronização de Catálogo (Data Feeds)**
> A descoberta da API `listItemFeeds` (`FULL` e `DELTA`) é a melhor de todas. 
> Em vez de a Oracle apenas reagir aos links que o usuário manda, podemos programar um *Worker* da Oracle para rodar de madrugada, puxar os pacotes `DELTA` (atualizações do dia) das Lojas Oficiais e popular um banco de dados interno de **"Achadinhos Pré-Aprovados"**. Isso criaria um feed nativo de produtos super em alta para o usuário publicar sem nem precisar pesquisar na Shopee.

> [!WARNING]
> **4. Triagem Automática de Qualidade (Filtro Anti-Flop)**
> Como a API entrega os campos `priceDiscountRate` (Desconto) e `commissionRate`, a Oracle pode criar um sistema de **Scoring de Oferta**. 
> Se o afiliado colar um link onde a comissão for irrisória (ex: menor que 1%) ou a nota do vendedor for ruim, o sistema pode alertar: *"Essa oferta paga pouca comissão, temos uma sugestão parecida na Loja Oficial X."*

---

## Conclusão: O que achamos?

Sim, **nós encontramos o pote de ouro**. A adoção definitiva do `itemId` foi o primeiro passo vital. O segundo passo, se decidirmos seguir em frente com essa arquitetura, será plugar as funções nativas de *Short Link* e os dados de *Prova Social* na Publicação Expressa, delegando o trabalho massivo aos *Data Feeds* para termos um catálogo de produtos infinito nas mãos!
