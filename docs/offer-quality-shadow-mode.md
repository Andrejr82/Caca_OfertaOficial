# Offer Quality V2 — Shadow Mode

O modo shadow permite observar a avaliação V2 durante um ciclo Discovery-Only
sem substituir a fila V1, sem alterar o estado das ofertas e sem publicar.

## Estados da flag

```env
OFFER_QUALITY_PIPELINE_V2=false
```

- `false` (padrão): nenhum callback shadow é executado.
- `shadow`: o worker pode receber um callback observacional (`qualityShadow`)
  com candidatos, selecionados, rejeitados e deferred. O callback não pode
  persistir, publicar ou alterar a fila.
- `active`: o worker executa a admissão V2 antes de `selectCopyQueue` e passa
  somente os vencedores admitidos para a fila V1. Este estado é opt-in e não
  deve ser usado sem aprovação de um ciclo controlado.

Qualquer erro do callback é isolado em `discovery.quality.shadow.failed` e não
derruba o ciclo V1.

Quando a flag está em `shadow`, o `oracle-scraper.cjs` carrega o runtime
empacotado `scripts/offer-quality-shadow-runtime.cjs`. Esse runtime converte os
candidatos do ciclo, executa o avaliador V2 e compara os vencedores V2 com os
selecionados pela fila V1. Ele retorna apenas contadores sanitizados para a
telemetria; não recebe cliente Supabase e não possui caminho de publicação.

## Contrato operacional

O callback recebe somente dados do ciclo atual:

- `correlationId`;
- `marketplace`;
- `candidates` após a validação estrutural;
- `queue.selected`, `queue.skipped` e `queue.deferred`.

Em `false` e `shadow`, o worker continua chamando a persistência V1 exatamente
como antes. Em `active`, a persistência ainda é a V1 existente, mas recebe
somente os candidatos admitidos pelo V2. A flag não deve ser alterada em
produção sem revisão do relatório comparativo V1 × V2 e aprovação explícita.

Na admissão `active`, o Oracle usa apenas `product.monetization.valid`, já
validado antes da fila. Nenhum `tracked_url`, UUID ou prefixo de canal é
fabricado nessa etapa; os quatro links continuam sendo criados e verificados
somente depois que o Supabase materializa o `offer_id`.

## Verificação

Os testes comprovam que:

1. com a flag desligada, o callback não é chamado;
2. em `shadow`, o callback é chamado de forma observacional;
3. a persistência V1 continua sendo chamada uma única vez;
4. falhas do shadow não alteram o estado final do ciclo.

No modo `active`, uma falha do avaliador é fail-closed para o marketplace: o
ciclo não cai silenciosamente para a seleção V1.

Não há escrita adicional no Supabase, reinício da Oracle/PM2 ou chamada de
publicação nesse modo.
