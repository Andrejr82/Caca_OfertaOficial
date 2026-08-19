# Implementação — Vídeos de Usabilidade por Categoria — 2026-08-19

## Objetivo

Padronizar a página `Vídeos de ofertas` para gerar prompts Gemini focados em demonstração de usabilidade do produto, substituindo o modelo com avatar ofertando como padrão principal.

A estrutura foi baseada no prompt de referência compartilhado para moda, cuja prioridade é demonstrar usabilidade/caimento e preservar exatamente a aparência do produto. fileciteturn412file0L5-L15

## Decisão

O gerador passa a produzir vídeos de aproximadamente 15 segundos, vertical 9:16, sem avatar ofertando, sem narração, sem diálogos, sem voz humana e sem textos promocionais. O foco é demonstração visual realista do produto com música instrumental.

## Estrutura fixa

1. produto/categoria/marketplace;
2. objetivo de usabilidade;
3. fidelidade absoluta à imagem de referência;
4. configuração de vídeo;
5. ambiente coerente com a categoria;
6. cinco cenas: apresentação, preparação, uso, detalhe/resultado, hero shot;
7. consistência entre frames;
8. movimentos de câmera conservadores;
9. regras de não invenção;
10. prioridade de geração.

## Categorias implementadas

- Moda e vestuário;
- Beleza e autocuidado;
- Casa e cozinha;
- Utilidades domésticas;
- Eletrônicos e games;
- Pet;
- Fitness e esporte;
- Bebê e criança;
- Acessórios;
- Organização e limpeza;
- fallback geral para produto físico.

## Regras obrigatórias

- imagem do produto é autoridade visual;
- mesmo produto físico do primeiro ao último frame;
- não inventar acessórios, peças, recursos, marcas ou textos;
- não usar 360 graus ou ângulos que forcem a invenção de lados não visíveis;
- cada categoria tem proibições específicas de claims não verificáveis;
- vídeo deve mostrar uso, não apenas uma pessoa falando sobre a oferta.

## Compatibilidade

A função pública `buildGeminiVideoPrompt()` foi mantida para não alterar o contrato da página. Internamente ela passa a usar o novo gerador `buildGeminiUsabilityPrompt()`.

`formatLongPriceForSpeech()` foi mantida por compatibilidade, embora o novo prompt não use fala.

## Testes

Os testes foram atualizados para validar:

- ausência de `Avatar_Silvia` e `FALA EXATA`;
- presença de 15 segundos, 9:16 e música instrumental;
- classificação automática de categoria;
- roteiro de moda com foco em caimento;
- roteiro pet com interação natural;
- roteiro de limpeza sem claims indevidos;
- regras fixas de preservação idênticas entre categorias;
- manutenção do helper legado de preço.

## Arquivos

- `src/lib/videos/gemini-usability-prompt.ts` — novo motor de templates;
- `src/lib/videos/gemini-prompt.ts` — façade compatível com a página atual;
- `src/tests/videos/gemini-prompt.test.ts` — testes do novo comportamento;
- `src/tests/videos/gemini-product-identity-prompt.test.ts` — testes de identidade.

## Resultado esperado

Ao selecionar uma oferta na página `Vídeos de ofertas`, o prompt exibido passa automaticamente a orientar o Gemini para um vídeo demonstrativo de usabilidade apropriado à categoria do produto, preservando a identidade visual e reduzindo dependência de avatar e discurso comercial.
