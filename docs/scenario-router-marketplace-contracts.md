# Roteador canônico e contratos por marketplace

## Problema corrigido

O cron executa seis ciclos de quatro horas. O roteador anterior concatenava todas as janelas editoriais que tocavam o período; por isso um ciclo podia combinar, por exemplo, moda masculina + enxoval e enviar palavras-chave de domínios diferentes para as três APIs.

## Regra nova

Cada ciclo automático escolhe exatamente um `scenarioId` canônico:

| Início (São Paulo) | Cenário |
|---:|---|
| 00h | tecnologia_desejo |
| 04h | treino_academia |
| 08h | mae_de_primeira_viagem |
| 12h | eletrodomesticos_cozinha |
| 16h | moda_masculina |
| 20h | enxoval_casamento |

A variável opcional `ORACLE_CYCLE_SCENARIO_ROUTING_JSON` permite uma rotação editorial explícita sem alterar o código. Valores inválidos são ignorados e o mapa seguro padrão permanece ativo.

As demais janelas continuam disponíveis para execução manual; elas não são misturadas no cron.

## Contratos de marketplace

`scripts/marketplace-scenario-contracts.cjs` entrega para cada marketplace um contrato com:

- `terms`/`keywords` próprios;
- `categories`/`apiCategories` próprios;
- `allowedProductTerms`;
- `blockedProductTerms`;
- `source: explicit_marketplace_contract`.

O contrato de Amazon não é mais derivado diretamente da lista de palavras da Shopee no ponto de roteamento. Mercado Livre recebe sua própria lista de intenções. Para `enxoval_casamento`, os três contratos exigem sinais de cama, mesa ou banho e bloqueiam pet, fitness, eletrônicos e eletrodomésticos genéricos.

## Segurança operacional

A mudança é compatível com a flag de qualidade V2 e não altera persistência, monetização ou publicação. O arquivo de contratos foi incluído no `scripts/update-oracle.js`, mas a Oracle só deve ser atualizada após a PR passar nos testes e ser mesclada.
