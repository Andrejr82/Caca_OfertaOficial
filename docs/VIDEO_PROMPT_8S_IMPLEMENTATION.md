# Vídeos de Ofertas — Prompt realista de 8 segundos

## Objetivo

Padronizar os prompts da página **Vídeos de ofertas** para gerar vídeos publicitários fotorrealistas de aproximadamente 8 segundos, com consistência visual da avatar oficial, fidelidade ao produto, locução em português brasileiro natural e direção de arte coerente com cada família de produto.

## Fluxo atual

1. O usuário seleciona uma oferta em `src/app/(dashboard)/videos/VideosClient.tsx`.
2. A página chama `buildGeminiVideoPrompt(selectedOffer)`.
3. A função é definida em `src/lib/videos/gemini-prompt.ts`.
4. O prompt é exibido no textarea e pode ser copiado para o Gemini/Google Flow.
5. O vídeo gerado é salvo no Google Drive e importado pela página.
6. `POST /api/videos/jobs` recebe o prompt efetivamente utilizado e o persiste no job/metadata.

A inteligência permanece centralizada no builder de prompt para não duplicar regras na interface.

## Contrato atual

```text
src/lib/videos/gemini-prompt.ts
    ↓
prompt realista de 8 segundos
    ↓
Avatar_Silvia oficial + preservação da identidade visual
    ↓
short_name prioritário
    ↓
remoção de especificações técnicas e códigos
    ↓
normalização linguística do nome falável
    ↓
preço monetário completo por extenso
    ↓
controle de até 22 palavras
    ↓
fallback de nome 8 → 6 → 4 → 3 palavras
    ↓
direção de arte premium por família de produto
    ↓
composição visual anti-alucinação baseada na imagem de referência
    ↓
lipsync + finalização antes dos 8s

src/tests/videos/gemini-prompt.test.ts
    ↓
valida esse contrato

docs/VIDEO_PROMPT_8S_IMPLEMENTATION.md
    ↓
documenta toda a arquitetura
```

## Avatar oficial

`Avatar_Silvia` é a referência visual oficial e obrigatória para os vídeos desta página. O operador deve fornecer ao gerador a imagem oficial correspondente a essa referência.

O prompt determina a preservação rigorosa de identidade facial, tom de pele, cabelo, proporções corporais, camiseta azul-marinho, calça jeans escura, tênis branco e da estampa original da camiseta com **CAÇA OFERTA**, chama, carrinho e etiqueta de desconto.

O gerador não deve recriar, traduzir, reinterpretar ou substituir a marca da camiseta. Em especial, **CAÇA OFERTA não pode ser trocado por outro nome**.

## Nome falável e normalização linguística

A locução usa `short_name` quando disponível. Se ele não existir, utiliza `product_name`.

O nome passa por três camadas antes de entrar na fala:

1. `normalizeTechnicalSpecsForSpeech()` remove informações dispensáveis como `1800W`, `127V`, `256GB`, `5G`, `4K`, `50"` e descritores técnicos.
2. `simplifyCommercialNameForSpeech()` reduz redundâncias e remove códigos técnicos como `BAF95A`.
3. `normalizeLinguisticSpeech()` corrige a forma falada sem alterar os dados originais da oferta.

Exemplo real:

```text
Parafusadeira Furadeira be lmpacto 2 Baterias 21V
→ Parafusadeira e Furadeira de Impacto com duas baterias
```

A camada também converte números que permanecerem na fala para sua forma por extenso.

## Preço monetário completo

O padrão oficial da locução usa a forma monetária completa em português brasileiro:

```text
R$ 123,90
→ cento e vinte e três reais e noventa centavos
```

A forma curta sem `reais` e `centavos` não é mais utilizada.

## Controle de 8 segundos

A geração mantém teto de **22 palavras** para a locução principal. A ordem de tentativa é:

1. gancho + nome + preço completo + CTA;
2. nome + preço completo + CTA;
3. redução progressiva do nome para 8, 6 e 4 palavras;
4. fallback mínimo de 3 palavras com CTA reduzido.

Como o preço completo possui mais palavras, produtos com nomes maiores podem perder o gancho `Olha esse achado!` para preservar a fala integral.

## Direção de arte premium por família

A antiga função de cenário genérico foi substituída conceitualmente por `visualDirectionByCategory()`, que retorna três elementos juntos:

- `scene`: ambiente, materiais, iluminação e linguagem visual;
- `interaction`: como a Avatar_Silvia apresenta o produto;
- `composition`: regras específicas de composição e anti-alucinação.

### Ferramentas

Parafusadeiras, furadeiras, marteletes, serras, lixadeiras e ferramentas similares usam:

- oficina contemporânea premium, limpa e organizada;
- bancada robusta de madeira escura e metal;
- painel de ferramentas e marcenaria discretos e desfocados;
- iluminação quente e contrastada, com luz de recorte e pontos âmbar;
- estética de campanha profissional de ferramentas elétricas;
- apresentadora ao lado da bancada, sem segurar, operar ou acionar a ferramenta.

A composição proíbe adicionar maleta, brocas, soquetes, carregadores, baterias extras, ferramentas, acessórios, peças ou consumíveis ausentes na imagem de referência.

### Automotivo

Usa garagem/detailing premium, concreto polido, superfícies grafite, iluminação linear e fundo automotivo discreto. Não cria veículos, cabos, adaptadores ou peças extras como parte da oferta.

### TV / Home theater

TVs usam sala contemporânea premium com estética de home theater, iluminação indireta quente e aparência residencial sofisticada. O prompt proíbe inventar soundbar, console, controle remoto, rack ou acessórios vendidos separadamente.

### Tecnologia

Smartphones, notebooks, tablets, headsets e similares usam estúdio tech contemporâneo premium, superfícies escuras acetinadas, detalhes metálicos e iluminação de recorte azul suave com luz quente no rosto. Evita o antigo visual gamer genérico.

### Cozinha e eletrodomésticos

Air Fryer, cafeteira, liquidificador, panela e similares usam cozinha residencial contemporânea premium, bancada limpa, materiais sofisticados e iluminação quente. Não cria alimentos, utensílios, cápsulas, copos ou acessórios inexistentes.

### Beleza

Beauty studio premium, clean e sofisticado, com iluminação difusa e estética de cosméticos de luxo. Não cria itens extras de kit ou embalagens adicionais.

### Moda e calçados

Fashion studio contemporâneo premium, minimalista e editorial. Não adiciona caixa, meias, bolsas, cadarços extras ou variações não presentes na referência.

### Casa e móveis

Interior residencial sofisticado, com materiais naturais, iluminação indireta e composição editorial. Não cria almofadas, mesas laterais ou módulos extras como parte da oferta.

### Fallback

Produtos sem família identificada usam estúdio publicitário contemporâneo premium, evitando cenário vazio, cru ou genérico.

## Autoridade visual e anti-alucinação

Foi criado o bloco **COMPOSIÇÃO DO PRODUTO**.

A regra central é:

> **A imagem de referência é a autoridade visual. Informações do título, descrição ou fala não autorizam adicionar componentes que não estejam visíveis nela.**

Isso significa que `2 baterias` no título não obriga o vídeo a mostrar duas baterias se a imagem de referência não as mostrar. A fala pode mencionar a característica comercial, mas a composição visual continua subordinada à referência.

O prompt também proíbe transformar a oferta em um kit maior do que aquele mostrado visualmente.

## Prompt estruturado

O prompt final é dividido em:

- PERSONAGEM;
- PRODUTO;
- COMPOSIÇÃO DO PRODUTO;
- CENA;
- ATUAÇÃO;
- CÂMERA;
- ÁUDIO E LIPSYNC;
- FALA EXATA;
- QUALIDADE;
- RESTRIÇÕES.

## Texto e identidade visual nas referências

A regra oficial é:

> **Não adicionar texto novo na tela. Textos, logotipos, símbolos, estampas e elementos gráficos já existentes nas imagens de referência da personagem e do produto devem ser preservados exatamente como aparecem.**

Isso preserva **CAÇA OFERTA** na camiseta e textos reais do produto enquanto continua proibindo legendas, preços escritos, overlays, elementos gráficos novos e marcas d'água.

## Arquitetura do módulo

```text
GeminiPromptOffer
  ↓
numeroPorExtenso()
precoPorExtenso()
  ↓
normalizeTechnicalSpecsForSpeech()
simplifyCommercialNameForSpeech()
normalizeLinguisticSpeech()
getSpeakableProductName()
compactProductName()
wordCount()
  ↓
visualDirectionByCategory()
  ├─ scene
  ├─ interaction
  └─ composition
  ↓
speechScript8Seconds()
  ↓
buildGeminiVideoPrompt()
```

## Compatibilidade

`VideosClient.tsx` continua chamando `buildGeminiVideoPrompt(selectedOffer)` sem mudança de contrato. `POST /api/videos/jobs` também não exige mudança.

Nenhum dado original da oferta é reescrito pela normalização de fala ou pela direção de arte.

## Testes automatizados

`src/tests/videos/gemini-prompt.test.ts` cobre:

- estrutura de 8 segundos e limite de 22 palavras;
- referência oficial `Avatar_Silvia` e preservação de `CAÇA OFERTA`;
- preço monetário completo;
- normalização linguística da parafusadeira;
- oficina premium para ferramentas;
- proibição de segurar/operar ferramenta;
- proibição de maleta, brocas, soquetes, carregadores e baterias extras não presentes na referência;
- autoridade visual da imagem de referência;
- cozinha premium para Air Fryer;
- tech studio premium para smartphone/notebook;
- sala premium de home theater para TV;
- preservação de textos e logotipos originais sem permitir texto novo;
- remoção de especificações técnicas e códigos comerciais dispensáveis.

## Critérios de aceite

- O prompt deve declarar vídeo de 8 segundos.
- `Avatar_Silvia` deve ser a referência visual oficial e obrigatória.
- A estampa **CAÇA OFERTA** deve ser preservada.
- A locução deve priorizar `short_name` e usar preço monetário completo.
- A fala deve respeitar o limite/fallback de 22 palavras.
- O cenário deve refletir a família real do produto com direção de arte premium.
- Produtos de ferramenta não devem ser segurados ou operados durante a apresentação.
- A imagem de referência deve prevalecer sobre título/descrição para a composição visual.
- O gerador não deve inventar acessórios ou transformar o produto em um kit maior.
- Textos e logotipos originais devem ser preservados e nenhum texto novo deve ser adicionado.
- A fala deve terminar antes do fim do vídeo.
- O contrato público de `buildGeminiVideoPrompt(offer)` e o backend de importação não devem mudar.

## Arquivos alterados

- `src/lib/videos/gemini-prompt.ts`
- `src/tests/videos/gemini-prompt.test.ts`
- `docs/VIDEO_PROMPT_8S_IMPLEMENTATION.md`

## Próximos passos possíveis

- ampliar a matriz de direção de arte com novas famílias conforme surgirem casos reais;
- criar presets visuais por marketplace ou campanha sem afetar a fala;
- registrar no metadata a família visual escolhida e a versão do template;
- criar presets futuros de 8, 15 e 30 segundos mantendo a mesma arquitetura.
