# Classificação e publicação V2 — especificação de migração

**Data:** 2026-07-21  
**Status:** aprovado para especificação; aguarda revisão deste documento antes do plano de implementação.  
**Escopo:** substituir gradualmente a ligação direta entre discovery e drafts por uma curadoria editorial baseada em classificação determinística, agrupamento seguro e perfis de compra.

## Objetivo

Impedir que itens semanticamente diferentes concorram entre si, reduzir o volume de ofertas que chegam à curadoria e fazer com que a Official AI receba somente uma decisão editorial já aprovada. A IA gera copy; não escolhe produto, marketplace, perfil, canal, horário ou publicação.

## Restrições inegociáveis

- O processo `oracle-scraper` permanece parado durante a implementação.
- Não haverá cenário manual real, gravação de discovery no ambiente produtivo nem reativação automática sem aprovação explícita do usuário.
- As ofertas e posts legados não serão apagados nem reclassificados automaticamente.
- A migração será executada em branch exclusiva e somente será integrada à `main` após testes completos e validação manual aprovada.
- Classificação e seleção são determinísticas; LLM não participa dessas decisões.

## Estado atual e problema

O fluxo atual é:

```text
Shopee / Mercado Livre / Amazon
  -> offers (pending_manual_review)
  -> Official AI
  -> drafts para Telegram + Instagram + WhatsApp
```

Isso materializa cada candidato como oferta editorial e cria drafts para três canais antes de haver uma decisão de curadoria. O banco observado contém backlog relevante em `pending_manual_review` e títulos que misturam produto principal, acessórios, kits e menções contextuais.

Exemplos que não podem concorrer no mesmo grupo:

- Air fryer 5L, air fryer oven 12L e air fryer 17L.
- Air fryer e cesta/formas de silicone.
- Air fryer e produto de limpeza que apenas menciona air fryer no título.
- Celular e suporte, tripé, carregador, ring light ou lupa de tela.

## Arquitetura alvo

```text
Adaptador de discovery por marketplace
  -> discovery_runs / discovery_items
  -> classificador determinístico
  -> classificações com evidência e confiança
  -> grupos exatos ou comparáveis
  -> recomendações por perfil de compra
  -> decisão editorial manual no painel
  -> uma solicitação de copy para um canal escolhido
  -> draft, aprovação e publicação oficiais
```

`offers`, `affiliate_links` e `posts` continuam sendo as entidades de publicação oficial. Itens V2 só passam a elas depois de uma decisão editorial explícita.

## Modelo V2

### Discovery

`discovery_runs` registra origem, marketplace, modo (`dry_run`, `manual_controlled`, `scheduled`), horário, versão de política e métricas.

`discovery_items` preserva o payload normalizado do marketplace, identidade nativa, título, URL, imagem, preços, evidências e vínculo ao run. Idempotência é por marketplace + identidade nativa; quando não houver identidade nativa, a linha exige revisão e não é deduplicada como produto exato.

### Classificação determinística

`offer_classifications` armazena:

- `item_role`: `main_product`, `accessory`, `bundle`, `coupon`, `replacement_part`, `service`, `unknown`;
- `product_type`: taxonomia canônica, por exemplo `air_fryer`, `coffee_maker`, `smartphone`, `running_shoe`;
- `brand`, `model` e `variant` somente quando literalmente evidenciados;
- `attributes` em JSON com unidades normalizadas;
- `classification_status`: `classified`, `review_required`, `excluded`;
- evidências textuais e `policy_version`.

O classificador usa regras, dicionários versionados, padrões e atributos extraídos do título/metadados. Nenhuma inferência sem evidência é permitida.

### Grupos

`product_groups` tem dois níveis:

1. `exact_product`: mesmo produto/variante em marketplaces distintos.
2. `comparable_family`: mesma finalidade e atributos decisivos, com marcas ou modelos distintos.

`product_group_members` vincula uma classificação a um grupo e registra o nível de confiança.

Uma classificação `review_required`, `excluded`, `accessory`, `bundle`, `coupon` ou `replacement_part` não pode participar de grupo `exact_product` nem concorrer por perfil de compra.

### Recomendações e curadoria

`publication_recommendations` guarda uma opção por grupo e perfil:

- `lowest_price`;
- `best_value`;
- `safest_purchase`;
- `premium`.

Ela contém explicação determinística, marketplace recomendado, evidência, canal/horário sugeridos e estado de curadoria. Nenhuma recomendação cria post ou link por si só.

`curation_decisions` registra a escolha humana: recomendação, canal, horário, formato, pauta, motivo e ator. A decisão aprovada é a única entrada permitida para a geração de copy.

## Regras de agrupamento

### Regra universal de segurança

Incerteza não produz equivalência. Se faltar atributo crítico, o item fica para revisão ou, no máximo, participa de uma família comparável explicitamente marcada como incompleta. Nunca entra em comparação de produto exato.

### Air fryer

| Campo | Produto exato | Família comparável |
|---|---|---|
| Tipo | obrigatório: `air_fryer` | obrigatório: `air_fryer` |
| Papel | `main_product` | `main_product` |
| Formato | obrigatório | obrigatório |
| Marca | obrigatória | opcional |
| Modelo | obrigatório | opcional |
| Capacidade | obrigatória | obrigatória, mesma capacidade/faixa |
| Voltagem | obrigatória | pode divergir, mas fica visível |
| Potência | quando disponível | informativa |

Exemplos:

- `Philco | PAF95A | cesto | 9.5L | 1800W | 220V`: grupo exato permitido.
- `Philco | PAF95A | cesto | 9.5L | 1800W | voltagem desconhecida`: candidata a revisão; não é equivalente exata.
- `air_fryer | cesto | 5L`: família comparável para menor preço/custo-benefício/segurança/premium.
- `cesta de silicone`: acessório, excluído.
- `air fryer + sanduicheira`: bundle, excluído.
- `10L / 17L`: revisão obrigatória por atributo ambíguo.

### Outras famílias

| Família | Atributos críticos de produto exato | Chave comparável |
|---|---|---|
| Cafeteira | marca, modelo, tipo, voltagem | tipo: filtro/cápsula/espresso |
| Notebook | marca, modelo, CPU, RAM, SSD, tela | faixa de uso + RAM/SSD |
| Smartphone | marca, modelo, RAM, armazenamento, conectividade | segmento + armazenamento |
| TV | marca, modelo, polegadas, resolução | polegadas + resolução/painel |
| Tênis | marca, linha/modelo, público; tamanho é variante | finalidade + público |
| Roupa | tipo, público, tamanho, tecido/coleção quando houver | tipo + público + estilo |
| Perfume | marca, fragrância, volume | fragrância + volume |

## Estratégia por marketplace

### Shopee

Mantém a API oficial GraphQL e cenários/termos como fonte de discovery. O cenário passa a ser somente a origem da consulta, não a categoria editorial final. A classificação utiliza item, loja, categoria nativa, vendas, rating, desconto, comissão e sinais de Mall/loja oficial quando presentes.

Prioridade: variedade, preço, tendência e itens de baixo/médio ticket com confiança verificável. Produto técnico/caro sem sinal forte de confiança não recebe recomendação `safest_purchase`.

### Mercado Livre

Mantém parsing SSR como discovery enquanto não houver fonte contratual mais estruturada. Categorias de origem serão submetidas a allowlist editorial por pauta, em vez de todas as categorias descobertas irem para a mesma fila.

Prioridade: oportunidade com economia verificável, produto técnico, eletrodoméstico, casa, games e marcas. Reputação, frete e elegibilidade só são usadas quando extraídas como evidência; não são presumidas.

### Amazon

Best Sellers passam a ser uma fonte de catálogo/demanda, não prova isolada de promoção. Browse nodes controlados substituem a dependência da ordem do DOM; produtos finalistas podem ser enriquecidos por fonte estruturada permitida antes de recomendação.

Prioridade: produtos de marca, técnicos, maior ticket e compra de confiança. Sem preço anterior/cupom verificável, a recomendação não usa linguagem de desconto/urgência.

### Fontes manuais

Netshoes, Shein, Magalu e outros poderão inserir itens em `discovery_items` com `source_mode=manual`. Devem fornecer os mesmos campos mínimos e passam pelo mesmo classificador, sem privilégio de agrupamento.

## Perfis de compra

Cada família comparável pode ter até uma recomendação elegível por perfil. O perfil não é uma alegação de qualidade absoluta.

| Perfil | Regra principal |
|---|---|
| Menor preço | menor preço final entre candidatos que passam piso de segurança |
| Custo-benefício | equilíbrio de preço, atributos, marca/sinais de confiança e risco |
| Compra segura | sinais de marca, modelo, loja e dados verificáveis têm peso maior |
| Premium | maior especificação/linha, com preço e confiança compatíveis |

Ausência de dados reduz elegibilidade/confiança; não é convertida em dado positivo.

## Official AI V2

A geração de copy recebe uma `curation_decision` aprovada, não um lote de IDs do discovery. Recebe fatos aprovados e o canal escolhido. A resposta do LLM limita-se a hook/copy; preço, desconto, urgência, cupom, estoque, qualidade e CTA factual são renderizados ou validados deterministicamente.

Os textos não podem declarar escassez, prazo, subida de preço, desconto ou condição que não exista nos fatos aprovados.

## Migração e compatibilidade

1. Nenhuma exclusão de tabelas ou colunas legadas.
2. Sem backfill automático de 6.362 ofertas históricas.
3. Itens legados permanecem acessíveis no painel atual como `legacy`.
4. O painel V2 começa vazio e recebe somente discovery V2 após autorização de cenário manual.
5. O worker antigo permanece inativo até o cutover aprovado.
6. Só após validação o worker passa a gravar em `discovery_items`; ele não chama Official AI automaticamente.

## Testes obrigatórios

Todos os comportamentos novos são TDD: cada teste deve falhar antes do código correspondente existir.

### Classificação

- produto principal versus acessório, bundle, cupom e limpeza;
- ausência de modelo/voltagem/capacidade;
- capacidade ambígua (`10L / 17L`);
- celular versus acessório de celular;
- tênis versus cadarço;
- unidade e normalização de atributos.

### Agrupamento

- mesmo modelo e mesma variante entra em grupo exato;
- mesma marca/modelo com voltagem distinta não entra em grupo exato;
- marcas diferentes entram apenas em família comparável;
- item excluído nunca é membro de grupo;
- determinismo e idempotência.

### Perfis e curadoria

- cada perfil respeita elegibilidade e piso de segurança;
- uma recomendação não cria post;
- decisão manual aprovada é pré-condição da copy;
- um canal escolhido gera somente um draft;
- decisão sem fatos verificáveis é rejeitada.

### Integração e regressão

- Shopee, Mercado Livre, Amazon e fonte manual produzem contrato comum de `discovery_item`;
- fluxo legado permanece funcional enquanto não houver cutover;
- nenhum discovery V2 aciona Official AI sem decisão;
- testes de schema, RLS, rotas, build e typecheck.

## Gates de liberação

1. Testes unitários e integração passam.
2. Migrations e RLS são revisadas e verificadas.
3. Painel V2 é revisado com dados de fixture, sem banco produtivo.
4. Usuário aprova cenário manual controlado.
5. Cenário manual é executado e auditado no banco/painel.
6. Usuário aprova reativação gradual da automação.
7. Automação entra primeiro em um marketplace/cenário/limite controlado; rollback é parar o processo e manter a V2 sem novos runs.

