# Relatório de Testes — Discovery V2

## Resultado executivo

O pipeline V2 passou nos testes determinísticos e no dry-run real da Shopee. A Oracle permaneceu parada e nenhuma oferta foi gravada ou publicada.

## Testes automatizados

- Suíte completa: 68 arquivos e 599 testes aprovados.
- TypeScript: `npx tsc --noEmit` aprovado.
- Fixture controlada: Shopee, Amazon e Mercado Livre.
- Regras verificadas: classificação, agrupamento, acessórios, reputação vermelha, limites por rodada e fila automática de Copy V2.

## Dry-run real da Shopee

Comando executado:

```powershell
node scripts/oracle-scraper.cjs --shopee-native-top20-dry-run --scenario eletros_cozinha
```

Resultado:

- HTTP 200 em todas as 16 buscas.
- 20 itens retornados por palavra-chave.
- 320 itens brutos recebidos antes de deduplicação e filtros.
- Cenário `eletros_cozinha` carregado corretamente.
- Nenhuma persistência no banco, chamada de IA ou publicação.

## Conclusão

A implementação está pronta para o próximo gate: executar um cenário manual controlado com persistência autorizada, inspecionar os produtos classificados no painel e somente depois decidir sobre a reativação gradual da Oracle.
