# TASK 11 — Comparação API bruta x funil corrigido

## Escopo e evidência

Esta matriz usa o golden set determinístico versionado em
`scripts/tests/MARKETPLACE_API_FIRST_GOLDEN_SET_2026-08-28.json`.
Ela é uma validação pré-Oracle, sem chamadas externas e sem escrita em
Supabase, ofertas, posts ou publicações.

Evidências executadas:

- `node --test scripts/tests/marketplace-api-first-golden-set.test.cjs`;
- 60 candidatos avaliados: 20 por marketplace;
- 168 avaliações marketplace no conjunto compartilhado (56 títulos x 3 marketplaces);
- 100% da amostra possui decisão explícita: `MUST_ACCEPT`, `MUST_REJECT` ou
  `AMBIGUOUS_REVIEW`;
- todas as decisões não ambíguas foram conferidas contra o contrato do cenário.

## Matriz observada

| Marketplace | Bruto | MUST_ACCEPT | MUST_REJECT | AMBIGUOUS_REVIEW | Famílias/cenários | Persistência |
|---|---:|---:|---:|---:|---|---:|
| Amazon | 20 | 10 | 8 | 2 | `informatica_editorial` e demais cenários do golden set | 0 |
| Mercado Livre | 20 | 10 | 8 | 2 | `informatica_editorial` e demais cenários do golden set | 0 |
| Shopee | 20 | 10 | 8 | 2 | `informatica_editorial` e demais cenários do golden set | 0 |
| **Total** | **60** | **30** | **24** | **6** | **contratos válidos** | **0** |

## Explicação da amostra

- `MUST_ACCEPT`: produto principal compatível com a intenção e contrato do marketplace.
- `MUST_REJECT`: acessório, peça, consumível, domínio incompatível ou falso positivo lexical.
- `AMBIGUOUS_REVIEW`: caso que não deve ser aprovado automaticamente sem evidência adicional.
- Os 60 candidatos são explicados por ID e decisão no fixture; não existem candidatos sem decisão.
- Exemplos preservados: notebook, monitor, SSD, roteador, webcam, mini PC,
  impressora, nobreak e switch de rede.
- Exemplos eliminados: suporte para notebook, suporte/adaptador para SSD, kit de
  limpeza, enrolador de cabo, filamento 3D, peça de impressora e smartwatch ambíguo.

## Limite desta evidência

O golden set valida a decisão do funil e a cobertura de falsos positivos, mas o
curador genérico exige `commercialIntent` canônico para ranqueamento. Em uma
execução controlada usando somente os campos disponíveis no golden set, o
resultado foi `raw=20`, `contractAccepted=10`, `ranked=5` e `selected=5` por
marketplace. Os cinco casos restantes não foram tratados como rejeição do
produto: foram classificados como lacuna de contrato/propagação de intenção.

Isso prova que a intenção canônica precisa ser propagada do cenário para o
curador antes da seleção. Nenhuma seleção foi promovida artificialmente.

A lacuna foi corrigida no adaptador da fila: quando a oferta já possui uma
`commercialIntent` válida no registro ou em
`explainability.commercialCuration`, ela é encaminhada ao ranking junto com o
`sourceScenarioId`. Valores desconhecidos continuam sujeitos ao classificador
existente. A correção foi validada nos testes direcionados de fila para
Shopee, Mercado Livre e Amazon; não houve gravação, publicação ou alteração de
dados externos.

## Matriz final de ranking e seleção

A execução reproduzível usou os 10 `MUST_ACCEPT` de cada marketplace, campos
comerciais mínimos e a intenção canônica disponível no curador. Todos os 10
foram classificados; o ranking aplicou o gate de elegibilidade e selecionou
somente os 5 aprovados. Os outros 5 foram mantidos fora da fila por
`weak_commercial_intent`, sem promoção artificial.

| Marketplace | Bruto | Aceitos | Classificados | Elegíveis/rankeados | Selecionados | Bloqueados | Famílias representadas |
|---|---:|---:|---:|---:|---:|---:|---|
| Amazon | 20 | 10 | 10 | 5 | 5 | 5 | `upgrade_trabalho_estudo`, `lazer_gamer_acessorio`, `movimento_em_casa` |
| Mercado Livre | 20 | 10 | 10 | 5 | 5 | 5 | `upgrade_trabalho_estudo`, `lazer_gamer_acessorio`, `movimento_em_casa` |
| Shopee | 20 | 10 | 10 | 5 | 5 | 5 | `upgrade_trabalho_estudo`, `lazer_gamer_acessorio`, `movimento_em_casa` |
| **Total** | **60** | **30** | **30** | **15** | **15** | **15** | **sem padding** |

Evidência dos bloqueios: `Mini PC`, `Nobreak`, `Roteador`, `SSD` e `Switch`
foram processados, mas ficaram fora da fila quando a intenção derivada não
apresentou aderência comercial suficiente. Esse resultado mantém o gate
fechado até existir intenção canônica compatível, em vez de fabricar uma
classificação.

## Resultado

- [x] total bruto por marketplace;
- [x] total por decisão/família de cenário;
- [x] accepted/rejected/review;
- [x] exemplos de falso positivo eliminado;
- [x] exemplos de produto preservado;
- [x] 100% da amostra com decisão explícita;
- [x] propagação da intenção canônica persistida validada no adaptador da fila;
- [x] ranking completo da amostra com critérios de elegibilidade reconciliados;
- [x] seleção/fila executada e validada por marketplace;
- [x] TASK 11 concluída.
