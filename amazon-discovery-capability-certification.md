# Amazon Discovery Capability Certification

## SCRAPE.DO vs SCRAPFLY

**Scrape.do**
* API dedicada Amazon (`/plugin/amazon/pdp`, `/plugin/amazon/search`).
* Retorno: JSON nativo. Sem render JS (bypassa WAF, evita DOM breaks).
* General Proxy API (`render=true`) desaconselhado. Lento, caro, WAF bloqueia.

**Scrapfly**
* Foco Web Scraping genérico + Anti-Bot (`asp=true`).
* Cloud Browser Rendering. Necessita URLs diretas. 
* Falha: Fallback Scrape.do.

## CLASSIFICAÇÃO

* ASIN, Prime, Availability, Seller, Official Seller, Review Count, Rating, Price, Images, Brand, Department, Browse Node: **EXTRAÍVEL SIM, ALTA confiabilidade.** Origem: Scrape.do JSON/PDP.
* Choice, Coupon, Deal, Lightning Deal, Old Price, Discount, Variations: **EXTRAÍVEL PARCIAL, MÉDIA confiabilidade.** Origem: PDP DOM volátil. Necessita IA para tratar.
* Necessita render: **NÃO** (usar Scrape.do Plugin JSON).
* Necessita browser: **NÃO** (Scrape.do bypassa).
* Necessita PDP: **SIM** (dados completos).
* Pode enriquecer Discovery: **SIM**.

## DISCOVERY

* **Trilhas independentes:** Movers & Shakers, Deals, Best Sellers.
* **Substituir fluxo:** API Scrape.do Plugin JSON substitui HTML Render Proxy.
* **Complementar:** New Releases, Most Wished For.
* **Desativadas:** Search keyword genérica (gera bloqueio, lixo).

## DIVERSIDADE

* **Evitar concentração:** Iterar por Browse Nodes, não categorias root.
* **Estratégia Round-Robin:** Rodízio de Browse Nodes + Sort Options.
* **Substituir keywords:** Browse Nodes substituem. IDs fixos, imunes a typos, imunes a captcha search.
* **Best Sellers:** Parar uso como única seed. Gera câmara de eco.
* **Movers & Shakers:** Agrega diversidade (tendências rápidas).
* **Deals / Coupons:** Agrega diversidade (oportunidades transientes).
* **Most Wished / New Releases:** Agrega diversidade (demanda latente / cauda longa).

## COMPARAÇÃO: ATUAL vs IDEAL

**Atual**
* Origem: HTML cru + Proxy.
* Erro crítico: Render manual via Proxy (`render=true` Scrape.do) atrai WAF. CSS quebra a cada 14 dias.
* Seed única: Best Sellers.

**Ideal**
* Origem: Scrape.do Amazon Plugin API (`/plugin/amazon/*`).
* Output estruturado (JSON direto da fonte, imune a DOM breaks). Fallback Scrapfly Web Scraping API (`asp=true`).
* Diversidade via trilhas independentes (Browse Nodes Round-Robin, Movers, Deals).

**Vantagem Competitiva**
* Migrar de Search DOM parsers para Endpoints Amazon Plugin Scrape.do + Browse Nodes diretos. Mais resiliência. Maior volume sem proxy bans.
