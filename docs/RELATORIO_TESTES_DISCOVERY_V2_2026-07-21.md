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

## Dry-run real da Amazon

Comando executado:

```powershell
node scripts/amazon-native-top20-v5.cjs --dry-run
```

Resultado:

- 28 categorias descobertas.
- 2 categorias e 2 subcategorias percorridas pelo limite padrão do script.
- 40 produtos válidos retornados.
- 6 chamadas HTTP.
- Relatório local gerado em `reports/amazon-native-top20-v5-dry-run.json`.
- Nenhuma gravação no banco, IA ou publicação.

Observação: o dry-run consultou bestsellers gerais; ainda não é um cenário restrito a eletros/cozinha.

## Experimento Amazon com maior cobertura

Comando executado:

```powershell
node scripts/amazon-native-top20-v5.cjs --dry-run --max-categories=2 --max-subcategories=5
```

Resultado:

- 10 subcategorias percorridas.
- 198 produtos válidos.
- 14 chamadas HTTP.
- Aplicando o classificador V2 para a família `eletros_cozinha`: 0 produtos relevantes.

Comparativo: a Shopee retornou 320 itens brutos em 16 buscas explicitamente orientadas a eletros; a Amazon retornou 198 itens de departamentos gerais e nenhum item da família-alvo. Portanto, aumentar limites sem trocar a origem das categorias não resolve a cobertura.

## Dry-run real do Mercado Livre

Comando executado:

```powershell
node scripts/oracle-scraper.cjs --mercadolivre-native-top20-dry-run
```

Resultado:

- 1 chamada realizada.
- 0 categorias retornadas.
- 0 produtos brutos, 0 válidos e 0 únicos.
- Nenhum erro foi registrado pelo relatório.
- Relatórios locais foram gerados em `reports/mercadolivre-native-top20-latest.{json,md}`.

Conclusão: Mercado Livre não está aprovado para operação; o resultado é inconclusivo e exige diagnóstico da fonte/API antes de entrar na fila V2.

## Ajuste Amazon por cenário direcionado

Foi criado o cenário Amazon `eletros_cozinha`, usando busca por 16 termos equivalentes aos da Shopee, em vez de bestsellers departamentais genéricos.

Comando:

```powershell
node scripts/amazon-native-top20-v5.cjs --dry-run --scenario eletros_cozinha
```

Resultado real:

- 16 consultas HTTP.
- 316 produtos retornados.
- 0 duplicidades por ASIN no lote.
- Após classificação V2: 249 produtos principais classificados, 63 para revisão e 4 acessórios excluídos.
- Famílias detectadas: cafeteira (39), batedeira (39), liquidificador (20), mixer (20), air fryer (14), sanduicheira (19), chaleira (17), panela (10), processador (31), forno (18), pipoqueira (9), cozedor de ovos (14) e espremedor (1).

Esse resultado é comparável ao dry-run Shopee de 320 itens brutos, mas agora a Amazon entrega a família de eletros solicitada.

## Conclusão

A implementação está pronta para o próximo gate: executar um cenário manual controlado com persistência autorizada, inspecionar os produtos classificados no painel e diagnosticar o Mercado Livre antes de decidir sobre a reativação gradual da Oracle.
