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

Qualquer erro do callback é isolado em `discovery.quality.shadow.failed` e não
derruba o ciclo V1.

## Contrato operacional

O callback recebe somente dados do ciclo atual:

- `correlationId`;
- `marketplace`;
- `candidates` após a validação estrutural;
- `queue.selected`, `queue.skipped` e `queue.deferred`.

O worker continua chamando a persistência V1 exatamente como antes. A flag não
deve ser alterada em produção sem revisão do relatório comparativo V1 × V2 e
aprovação explícita.

## Verificação

Os testes comprovam que:

1. com a flag desligada, o callback não é chamado;
2. em `shadow`, o callback é chamado de forma observacional;
3. a persistência V1 continua sendo chamada uma única vez;
4. falhas do shadow não alteram o estado final do ciclo.

Não há escrita adicional no Supabase, reinício da Oracle/PM2 ou chamada de
publicação nesse modo.
