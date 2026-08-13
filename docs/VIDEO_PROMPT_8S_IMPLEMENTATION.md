# Vídeos de Ofertas — Prompt realista de 8 segundos

## Objetivo

Padronizar os prompts da página **Vídeos de ofertas** para gerar vídeos publicitários fotorrealistas de aproximadamente 8 segundos, com consistência visual da avatar oficial, fidelidade ao produto e locução em português brasileiro natural, curta e integral.

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
cena dinâmica por categoria
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

O prompt determina a preservação rigorosa de:

- identidade facial, tom de pele, cabelo e proporções corporais;
- camiseta azul-marinho, calça jeans escura e tênis branco;
- estampa original da camiseta;
- texto **CAÇA OFERTA**;
- chama, carrinho e etiqueta de desconto presentes na estampa.

O gerador não deve recriar, traduzir, reinterpretar ou substituir a marca da camiseta. Em especial, **CAÇA OFERTA não pode ser trocado por outro nome**.

## Nome falável do produto

A locução usa `short_name` quando disponível. Se ele não existir, utiliza `product_name`.

O nome passa por três camadas antes de entrar na fala.

### 1. Normalização técnica

`normalizeTechnicalSpecsForSpeech()` remove informações dispensáveis para uma locução de 8 segundos, sem alterar os dados originais da oferta.

Exemplos removidos:

- capacidade e volume: `9,5L`, `500ml`;
- potência e tensão: `1800W`, `127V`, `220V`, `bivolt`;
- memória e armazenamento: `16GB`, `256GB`, `512GB`, `1TB`;
- tela e resolução: `50"`, `Full HD`, `4K`, `8K`, `HDR`, `LED`, `QLED`, `OLED`;
- conectividade: `Wi-Fi`, `Bluetooth`, `3G`, `4G`, `5G`;
- frequência e outras unidades técnicas: `Hz`, `MHz`, `GHz`, `mAh`, `BTU`, `MP`;
- descritores pouco úteis para 8 segundos, como `Painel Digital`.

### 2. Simplificação comercial

`simplifyCommercialNameForSpeech()`:

- reduz `Fritadeira Air Fryer` para `Air Fryer`;
- remove códigos técnicos como `BAF95A`, `XJ900` e `SM-A556E`;
- mantém o núcleo comercial reconhecível do produto.

### 3. Normalização linguística

`normalizeLinguisticSpeech()` corrige a forma falada sem alterar `product_name` ou `short_name` armazenados.

Exemplos:

```text
Parafusadeira Furadeira be lmpacto 2 Baterias 21V
→ Parafusadeira e Furadeira de Impacto com duas baterias
```

A camada também converte números que permanecerem no nome comercial para sua forma falada:

```text
iPhone 15 → iPhone quinze
IdeaPad Slim 3 → IdeaPad Slim três
2 Baterias → duas baterias
```

O objetivo é impedir algarismos, abreviações técnicas e erros evidentes de marketplace na `FALA EXATA`.

## Preço monetário completo

O padrão oficial voltou a ser a forma monetária completa em português brasileiro.

```text
R$ 123,90
→ cento e vinte e três reais e noventa centavos

R$ 471,80
→ quatrocentos e setenta e um reais e oitenta centavos
```

A fala não utiliza mais a forma curta `cento e vinte e três e noventa`.

`formatLongPriceForSpeech()` continua disponível e representa o mesmo formato monetário oficial usado pela locução.

## Controle de 8 segundos

A geração mantém teto de **22 palavras** para a locução principal.

A ordem de tentativa é:

1. gancho + nome + preço completo + CTA;
2. nome + preço completo + CTA;
3. redução progressiva do nome para 8, 6 e 4 palavras;
4. fallback mínimo de 3 palavras com CTA reduzido.

Como o preço completo possui mais palavras, ofertas com nomes maiores podem perder o gancho `Olha esse achado!` para preservar a fala integral dentro do limite.

## Prompt estruturado

O prompt final permanece dividido nos blocos:

- PERSONAGEM;
- PRODUTO;
- CENA;
- ATUAÇÃO;
- CÂMERA;
- ÁUDIO E LIPSYNC;
- FALA EXATA;
- QUALIDADE;
- RESTRIÇÕES.

A estrutura visual, câmera, atuação, cenas dinâmicas e timing de 8 segundos foram preservados.

## Áudio e lipsync

O prompt agora explicita que:

- a voz é feminina adulta em português brasileiro;
- todas as palavras devem ser pronunciadas em português correto;
- todos os números presentes na fala devem ser pronunciados por extenso;
- valores monetários usam `reais` e `centavos` quando aplicável;
- algarismos, abreviações técnicas, símbolos e códigos não devem ser pronunciados;
- nenhuma palavra pode ser cortada ou omitida;
- a última palavra termina antes do fim do vídeo;
- aproximadamente 0,3 segundo de imagem permanece após a última palavra.

## Texto e identidade visual nas referências

A regra antiga `Sem texto na tela` foi removida por conflitar com textos legítimos existentes nas imagens de referência.

A regra oficial agora é:

> **Não adicionar texto novo na tela. Textos, logotipos, símbolos, estampas e elementos gráficos já existentes nas imagens de referência da personagem e do produto devem ser preservados exatamente como aparecem.**

Isso permite preservar a marca **CAÇA OFERTA** na camiseta e textos/logotipos reais do produto, ao mesmo tempo que continua proibindo legendas, preços escritos, overlays, elementos gráficos novos e marcas d'água.

## Inteligência visual

As regras por categoria continuam válidas:

- cozinha: produto em bancada e cenário de cozinha;
- tecnologia portátil: produto nas mãos;
- TV/televisor e tecnologia: cenário tecnológico;
- beleza: cenário clean/spa;
- moda/calçados: cenário esportivo correspondente;
- fallback: estúdio publicitário premium.

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
productInteraction()
studioBackground()
  ↓
speechScript8Seconds()
  ↓
buildGeminiVideoPrompt()
```

## Exemplos

### Parafusadeira

```text
Parafusadeira Furadeira be lmpacto 2 Baterias 21V
→ Parafusadeira e Furadeira de Impacto com duas baterias
```

Com `R$ 123,90`, a fala utiliza:

```text
cento e vinte e três reais e noventa centavos
```

### Air Fryer

```text
Fritadeira Air Fryer Britânia BAF95A 9,5L Painel Digital 1800W
→ Air Fryer Britânia
```

### Smartphone

```text
Smartphone Samsung Galaxy A55 256GB 5G Bluetooth
→ Smartphone Samsung Galaxy A55
```

### iPhone

```text
Apple iPhone 15 128GB 5G
→ Apple iPhone quinze
```

### TV

```text
Smart TV Samsung 50" 4K QLED HDR
→ Smart TV Samsung
```

### Notebook

```text
Notebook Lenovo IdeaPad Slim 3 512GB 16GB Full HD Wi-Fi
→ Notebook Lenovo IdeaPad Slim três
```

## Compatibilidade com o fluxo atual

`VideosClient.tsx` continua chamando `buildGeminiVideoPrompt(selectedOffer)` sem mudança de contrato. `POST /api/videos/jobs` também não exige mudança e continua persistindo o prompt efetivamente utilizado.

Nenhum dado original da oferta é reescrito pela normalização de fala.

## Testes automatizados

`src/tests/videos/gemini-prompt.test.ts` cobre:

- estrutura de 8 segundos e limite de 22 palavras;
- referência oficial `Avatar_Silvia`;
- preservação explícita de `CAÇA OFERTA` e da estampa da camiseta;
- proibição de texto novo sem apagar textos originais das referências;
- prioridade de `short_name`;
- preço monetário completo com reais e centavos;
- correção `be lmpacto` → `de Impacto`;
- correção `Parafusadeira Furadeira` → `Parafusadeira e Furadeira`;
- conversão `2 Baterias` → `duas baterias`;
- remoção de especificações técnicas de Air Fryer, smartphone, TV e notebook;
- remoção de código técnico `BAF95A`;
- simplificação `Fritadeira Air Fryer` → `Air Fryer`;
- pronúncia por extenso de números de modelos comerciais;
- cenários e interações por categoria.

## Critérios de aceite

- O prompt deve declarar vídeo de 8 segundos.
- `Avatar_Silvia` deve ser declarada como referência visual oficial e obrigatória.
- A estampa **CAÇA OFERTA** deve ser preservada e nunca substituída por outra marca.
- A locução deve priorizar `short_name`.
- Especificações e códigos técnicos dispensáveis devem ser removidos apenas da fala.
- Erros linguísticos evidentes cobertos pela normalização devem ser corrigidos somente na fala.
- Todos os números que permanecerem na fala devem aparecer por extenso.
- O preço deve usar a forma monetária completa com `reais` e `centavos` quando aplicável.
- A locução deve respeitar o fallback do limite de 22 palavras.
- O prompt deve proibir texto novo, legendas, preços escritos, overlays e marca d'água.
- Textos e logotipos originais das imagens de referência devem ser preservados.
- A fala deve terminar antes do fim do vídeo.
- O contrato público de `buildGeminiVideoPrompt(offer)` e o backend de importação não devem mudar.

## Arquivos alterados

- `src/lib/videos/gemini-prompt.ts`
- `src/tests/videos/gemini-prompt.test.ts`
- `docs/VIDEO_PROMPT_8S_IMPLEMENTATION.md`

## Próximos passos possíveis

- ampliar o dicionário de correções linguísticas apenas com erros reais observados em produção;
- gerar `short_name` automaticamente na ingestão quando o marketplace não fornecer nome adequado;
- registrar no metadata a contagem de palavras e a versão do template;
- criar presets futuros de 8, 15 e 30 segundos mantendo a mesma arquitetura.
