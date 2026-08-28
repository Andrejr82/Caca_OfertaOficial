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

O golden set valida a decisão do funil e a cobertura de falsos positivos, mas não
mede uma execução real de ranking/fila por marketplace. Portanto, `ranked` e
`selecionados` permanecem pendentes e não são inferidos a partir de `MUST_ACCEPT`.

## Resultado

- [x] total bruto por marketplace;
- [x] total por decisão/família de cenário;
- [x] accepted/rejected/review;
- [x] exemplos de falso positivo eliminado;
- [x] exemplos de produto preservado;
- [x] 100% da amostra com decisão explícita;
- [ ] ranking real executado por marketplace;
- [ ] seleção/fila real executada por marketplace;
- [ ] TASK 11 concluída.
