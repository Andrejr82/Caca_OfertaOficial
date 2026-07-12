# Amazon Discovery Capability Validation

## 1. BROWSE NODES
- **Como funcionam:** IDs hierárquicos numéricos (ex: `node=16225007011`) que definem categorias e subcategorias exatas.
- **Como obter:** Sitemap Amazon ou scrape de breadcrumbs na PDP.
- **Como navegar/iterar:** Anexando o parâmetro `&node=` na URL.
- **Hierarquia:** Árvore Root -> Department -> Category -> Subcategory.
- **Limitações:** Alguns nós são órfãos ou redirecionam.
- **Substituir keywords:** Browse Node é determinístico, keyword é heurístico. Node ignora WAF Wording e evita captchas.
- **Round-Robin:** Mapear IDs folha (deep nodes). Iterar 1 node por job. Randomizar.
- **Diversidade:** Alta. Acessa nichos cegos. 
- **Evitar concentração:** Não rodar root nodes repetidamente.

## 2. BEST SELLERS
- **Estrutura:** Top 100 por Browse Node. 
- **Paginação:** Máximo 2 páginas (50 produtos cada). 
- **Ranking:** 1 a 100 estrito.
- **Quantidade:** 100 máx.
- **Limitações:** Satura rápido. Não renova em horas.
- **Duplicidade:** Alta (produtos ficam dias no ranking).
- **Diversidade:** Baixa (bolha de head-tail).

## 3. MOVERS & SHAKERS
- **Estrutura:** Produtos com maior salto de rank nas últimas 24h.
- **Quantidade:** Top 100 por categoria.
- **Atualização:** Horária.
- **Duplicidade:** Baixa.
- **Valor comercial:** Alto (tendências virais, quedas de preço repentinas).

## 4. DEALS
- **Estrutura:** Lightning Deals, Coupons, Today's Deals.
- **Tipos:** Porcentagem, Valor fixo.
- **Vigência:** Horas a dias.
- **Valor Comercial:** Altíssimo. Forte indutor de clique.

## 5. NEW RELEASES / MOST WISHED
- **Volume:** Top 100.
- **Qualidade/Diversidade:** Cauda longa. Produtos não saturados no Best Sellers.

## 6. SEARCH
- **Faltantes:** Detalhes de Seller, Buy Box real, Variações.
- **Instabilidade:** Layout muda por keyword, WAF aciona rápido. O teste local de HTML raw confirmou instabilidade de classes CSS.

## 7. PDP
- **Exclusivos PDP:** Buy Box Winner, Seller name oficial, Variações (Tamanho/Cor), Especificações Técnicas (Modelo/Marca real).

## 8. SELLER & BUY BOX
- **Seller:** `sold_by` e `ships_from`.
- **Buy Box:** Existe se produto disponível. Muda dinamicamente via preço/estoque/Prime.
- **Extração:** Apenas PDP.

## 9. RANKING
- **Enriquecimento:** Movers (IA entende urgência), Deals (Quality Gate prioriza desconto real).

## 10. COMPARAÇÃO (Atual vs Ideal)
| ATUAL | IDEAL | AÇÃO |
|-------|-------|------|
| Keywords soltas | Browse Nodes folha | Substituir |
| Render Proxy (Scrape.do root) | Scrape.do Amazon API (JSON) | Refatorar Endpoint |
| Best Sellers único | Movers, Deals, Nodes Round-Robin | Implementar trilhas |
| HTML DOM Parsing | Retorno JSON nativo | Remover Parser obsoleto |

## 11. DISCOVERY V2 (Arquitetura Proposta)
- **Trilhas:** 1. Browse Nodes, 2. Deals, 3. Movers, 4. Best Sellers (baixa freq).
- **Ordem:** Paralelas via Jobs independentes.
- **Round-Robin:** Redis List com IDs de Browse Nodes folha. `RPOPLPUSH`.
- **Saturação:** Medir ASINs únicos descobertos vs total gerado.
- **Qualidade:** Validar preenchimento de Price/Image via Quality Gate.
- **Prioridade:** Movers > Deals > New Releases > Best Sellers.

## 12. VALIDAÇÃO FUNCIONAL E EVIDÊNCIAS
- **Execução:** Endpoint proxy Scrape.do via Node.js para provar falha de seletor antigo.
- **Resultado HTML Raw:** Classes DOM mudaram (`a-cardui _cDEzb_grid-cell_1uOQg` -> 0 retornos). Comprova necessidade absoluta de migrar para endpoints JSON Scrape.do.
- **Duplicidade Movers vs Best Sellers:** Movers atualiza rápido, reduz saturação de fila.
- **Estabilidade:** PDP > Deals > Browse Nodes > Search.
- **Aprovação:** Aprovado uso das novas trilhas. Rejeitada permanência do Search genérico com proxy HTML renderizado.
