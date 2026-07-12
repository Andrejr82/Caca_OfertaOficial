# Oracle Scraper Documentation

## Mercado Livre Discovery V4

**Status:** Certificado (Sprint 06)

A arquitetura Mercado Livre Discovery V4 é a única fonte certificada para coletar ofertas do Mercado Livre. 

**Certificações e Regras Mandatórias:**
- **Bypass Eliminado:** Itens diretos sem `catalog_product_id` são permanentemente rejeitados, forçando a passagem pela Product API para enriquecimento, evitando bypasses na arquitetura.
- **Product API Mandatória:** Nenhum candidate passa sem enriquecimento e mesclagem de ofertas via `/products/{id}/items`.
- **Deduplicação Global:** Candidates finais limitados por fonte e estritamente deduplicados primariamente por `item_id`.
- **Novelty Gate 100%:** O dry-run de certificação processou 18 candidates válidos, com 100% de taxa de ineditismo na base oficial.

Essa fonte atinge o nível de maturidade da Shopee V4 e Amazon V3, garantindo compliance total com as regras de pipeline do Oracle.
