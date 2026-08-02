# Roteador canônico e contratos por marketplace

## Problema corrigido

O cron antigo agrupava cenários em seis ciclos de quatro horas. Isso misturava domínios, deixava a oferta envelhecer até a publicação e permitia que o mesmo produto disputasse filas incompatíveis.

## Regra nova

A descoberta automática roda de hora em hora, das 06h às 20h (São Paulo), preparando a fila editorial seguinte. A publicação permanece alinhada às filas de 07h a 22h:

| Descoberta | Publicação | Cenário |
|---:|---:|---|
| 06h | 07h | `casa_cozinha_editorial` |
| 07h | 08h | `organizacao_editorial` |
| 08h | 09h | `ferramentas_editorial` |
| 09h | 10h | `informatica_editorial` |
| 10h | 11h | `celulares_editorial` |
| 11h | 12h | `beleza_editorial` |
| 12h | 13h | `moda_editorial` |
| 13h | 14h | `esporte_editorial` |
| 14h | 15h | `pet_editorial` |
| 15h | 16h | `automotivo_editorial` |
| 16h | 17h | `games_editorial` |
| 17h | 18h | `tv_audio_editorial` |
| 18h | 19h | `eletrodomesticos_editorial` |
| 19h | 20h | `moveis_editorial` |
| 20h | 21h | `grandes_ofertas_editorial` |
| — | 22h | `cupons_aprovados_editorial` (manual) |
| — | 23h | Reserva operacional |
| — | 00h–06h | Sem publicação editorial |

Cada ciclo escolhe exatamente um cenário novo. `grandes_ofertas_editorial` exige revalidação; `cupons_aprovados_editorial` não consulta produtos automaticamente. Ofertas são descartadas quando ultrapassam a idade máxima, mudam de preço, perdem estoque ou deixam de resolver a URL.

`ORACLE_CYCLE_SCENARIO_ROUTING_JSON` continua aceitando rotação explícita, mas somente IDs editoriais válidos. IDs antigos não são mais contratos ativos.

## Contratos de marketplace

`scripts/marketplace-scenario-contracts.cjs` entrega para cada marketplace um contrato com:

- `terms`/`keywords` próprios;
- `categories`/`apiCategories` próprios;
- `allowedProductTerms`;
- `blockedProductTerms`;
- atributos e prioridade editorial;
- idade máxima, exclusividade e modo de descoberta;
- `source: explicit_marketplace_contract`.

Os contratos editoriais são definidos em `docs/editorial-scenario-contracts-v1.md`. A classificação segue categoria oficial, subcategoria, atributos e título; conflitos e `unknown` não entram na fila de publicação.

## Mecanismos preservados

Os mecanismos atuais continuam sendo usados: Shopee nativo, Mercado Livre API oficial e Amazon por browse node/termos. A troca altera apenas contratos, roteamento e fila editorial; não introduz scraping, dependência nova ou geração paralela.

## Segurança operacional

A mudança mantém a flag de qualidade V2 e não altera persistência, monetização ou publicação. A Oracle só deve ser atualizada após a branch passar nos testes e ser mesclada.
