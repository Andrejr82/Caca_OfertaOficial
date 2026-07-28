# Offer Quality V2 — Active Admission

Este documento descreve a integração preparada, mas não ativada, do motor de
qualidade V2 com a fila de Discovery.

## Estados

```env
OFFER_QUALITY_PIPELINE_V2=false
```

| Valor | Comportamento |
|---|---|
| `false` | Caminho V1 original; o V2 não é chamado e os candidatos não são alterados. |
| `shadow` | Compara V1 × V2 somente para observabilidade; não filtra nem persiste. |
| `active` | Executa a admissão V2 antes de `selectCopyQueue`; somente vencedores seguem para a fila V1. |

## Ordem operacional em `active`

```text
discovery
→ validação nativa, URL, título, imagem e preço
→ validação de monetização pré-persistência
→ admissão V2 (identidade, agrupamento, score e vencedor)
→ selectCopyQueue V1 (limites editoriais)
→ persistDiscoveryIngestionV1
→ criação/verificação dos quatro affiliate_links
```

A admissão não recebe cliente Supabase e não cria URLs. Antes de existir o
`offer_id`, ela usa somente `product.monetization.valid`, que representa a
monetização já validada pelo Oracle. Os links `tg_`, `wp_`, `fb_` e `ig_` com
UUID completo continuam sendo materializados somente no estágio de persistência
existente.

## Fail-closed e rollback

Se o adaptador V2 falhar em `active`, o marketplace falha explicitamente e não
retorna silenciosamente à seleção V1. Para rollback, defina:

```env
OFFER_QUALITY_PIPELINE_V2=false
```

Nenhuma migração ou restauração de dados é necessária. Esta branch não altera a
flag de produção, não executa ciclos, não reinicia PM2 e não faz deploy Oracle.

## Critério de ativação futura

Antes de usar `active`, é obrigatório revisar um relatório `shadow` de ciclo
controlado, comparar vencedores V1 × V2 por marketplace e aprovar explicitamente
o resultado. Amazon sem evidência de preço anterior deve continuar sem alegação
de desconto; ofertas Shopee de score baixo devem permanecer em revisão.
