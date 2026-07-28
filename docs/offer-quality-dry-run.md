# Avaliação de Qualidade Multimarketplace — Dry-run

Esta capacidade avalia candidatos de Mercado Livre, Amazon e Shopee antes de qualquer integração futura com persistência. Ela não substitui o fluxo atual.

## Estado operacional

- `OFFER_QUALITY_PIPELINE_V2=false` por padrão.
- A Oracle continua usando o caminho atual.
- O dry-run não grava no Supabase.
- O dry-run não chama IA, publicação, PM2 ou credenciais de marketplace.
- A ativação futura exige revisão do relatório e aprovação explícita.

## Execução local

Use uma entrada JSON ou NDJSON explícita:

```bash
node scripts/offer-quality-dry-run.cjs \
  --input src/tests/fixtures/offer-quality/multimarketplace.json \
  --output reports/offer-quality
```

O wrapper usa a dependência local `tsx` em modo `--no-install`. Não há scraping implícito.

## Saída

São gerados dois arquivos no diretório informado:

- `<run-id>.json`: relatório completo;
- `<run-id>.ndjson`: resumo e uma decisão por linha.

O relatório contém:

- candidatos recebidos;
- grupos formados;
- vencedores;
- duplicados editoriais;
- rejeições e motivos;
- score por componente;
- confiança do desconto;
- estado dos quatro links de canal;
- `persistAttemptCount: 0`.

URLs são sanitizadas removendo query string e fragmento. Segredos não devem ser incluídos na entrada.

## Interpretação

Um desconto só é `verified` quando há evidência explícita de preço anterior ou histórico. A diferença entre `originalPrice` e `currentPrice` sem evidência é `unverified` e não recebe pontuação de desconto confirmado.

A identidade é específica:

- Mercado Livre: `item_id`, com catálogo `/p/MLB...` quando disponível;
- Amazon: ASIN válido;
- Shopee: `itemId` e, quando disponível, `shopId`.

A monetização é completa somente quando existem os quatro canais com prefixos e UUID completo:

- `tg_UUID`;
- `wp_UUID`;
- `fb_UUID`;
- `ig_UUID`.

Não existe fallback que troque prefixos ou fabrique URLs.

## Critérios para futura ativação

A integração com o worker só poderá ser avaliada depois de:

1. testes direcionados, typecheck e build verdes;
2. relatório reproduzível;
3. revisão manual de agrupamentos e rejeições;
4. confirmação de zero gravações;
5. comparação com o fluxo atual;
6. aprovação explícita para um ciclo controlado.

## Rollback

Enquanto a flag permanecer `false`, o rollback é manter a branch separada ou remover os módulos de avaliação. Não há migração, backfill ou restauração de dados.
