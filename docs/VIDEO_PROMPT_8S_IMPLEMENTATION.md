# Vídeos de Ofertas — Prompt realista de 8 segundos

## Objetivo

Padronizar os prompts da página **Vídeos de ofertas** para gerar vídeos publicitários fotorrealistas de aproximadamente 8 segundos, com maior consistência visual da avatar e do produto e, principalmente, com uma locução curta o suficiente para não ser cortada pelo gerador.

## Fluxo atual

1. O usuário seleciona uma oferta em `src/app/(dashboard)/videos/VideosClient.tsx`.
2. A página chama `buildGeminiVideoPrompt(selectedOffer)`.
3. A função é definida em `src/lib/videos/gemini-prompt.ts`.
4. O prompt é exibido no textarea e pode ser copiado para o Gemini/Google Flow.
5. O vídeo gerado é salvo no Google Drive e importado pela página.
6. `POST /api/videos/jobs` recebe o prompt efetivamente utilizado e o persiste no job/metadata.

A alteração permanece centralizada no builder de prompt para não duplicar regras na interface.

## Problema identificado

A implementação anterior concatenava título do produto, marketplace, preço por extenso e CTA em uma única locução. Em produtos com nomes comerciais longos, a fala ultrapassava o que cabe naturalmente em 8 segundos, causando aceleração, omissão ou corte das últimas palavras.

Além disso, títulos de marketplace carregam especificações técnicas e códigos de modelo que são úteis na ficha da oferta, mas pouco naturais para uma locução curta e podem aumentar o risco de pronúncia ruim e lipsync instável.

## Estratégia adotada

### 1. Duração alvo

- Duração declarada no prompt: **8 segundos**.
- A fala deve começar imediatamente.
- A última palavra deve terminar antes do final do vídeo.
- Reserva visual de aproximadamente 0,3 segundo após a última palavra.

### 2. Nome falável do produto

A locução usa `short_name` quando disponível. Se ele não existir, o sistema usa `product_name`.

Antes de montar a fala, `normalizeTechnicalSpecsForSpeech()` remove especificações dispensáveis para a locução, preservando o núcleo comercial do nome do produto.

Exemplos removidos da fala:

- capacidade e volume: `9,5L`, `500ml`;
- potência e tensão: `1800W`, `127V`, `220V`, `bivolt`;
- memória e armazenamento: `16GB`, `256GB`, `512GB`, `1TB`;
- tela e resolução: `50\"`, `Full HD`, `4K`, `8K`, `HDR`, `LED`, `QLED`, `OLED`;
- conectividade: `Wi-Fi`, `Bluetooth`, `3G`, `4G`, `5G`;
- frequência e outras unidades técnicas: `Hz`, `MHz`, `GHz`, `mAh`, `BTU`, `MP`;
- descritores pouco úteis para 8 segundos, como `Painel Digital`.

Em seguida, `simplifyCommercialNameForSpeech()` faz uma segunda limpeza exclusivamente comercial:

- reduz redundâncias como `Fritadeira Air Fryer` para `Air Fryer`;
- remove códigos técnicos alfanuméricos longos como `BAF95A`, `XJ900` e `SM-A556E`;
- preserva linhas comerciais com número separado, como `iPhone 15`, `Galaxy A55` e `IdeaPad Slim 3`.

O nome completo do produto continua disponível para card, banco, publicação e demais fluxos. Essas normalizações afetam apenas a fala do vídeo.

Para títulos ainda longos, a fala tenta versões com 8, 6 e 4 palavras do nome e possui um fallback mínimo de 3 palavras.

### 3. Preço falável curto

O preço do vídeo usa uma forma mais compacta. Exemplo:

- `R$ 471,80`
- forma longa: `quatrocentos e setenta e um reais e oitenta centavos`
- forma curta: `quatrocentos e setenta e um e oitenta`

A forma longa permanece disponível no módulo para usos futuros por meio de `formatLongPriceForSpeech()`.

### 4. Limite de palavras

A geração usa um teto de **22 palavras** para a locução principal de 8 segundos. O roteiro tenta primeiro uma versão comercial completa e, se exceder o limite, remove o gancho inicial e reduz progressivamente o nome falável do produto.

### 5. Prompt estruturado

O prompt final é dividido em blocos semânticos: PERSONAGEM, PRODUTO, CENA, ATUAÇÃO, CÂMERA, ÁUDIO E LIPSYNC, FALA EXATA, QUALIDADE e RESTRIÇÕES.

### 6. Inteligência visual preservada e ampliada

As regras por categoria continuam válidas: produto em bancada para cozinha; produto nas mãos para tecnologia portátil; ambientes coerentes com cozinha, tecnologia, beleza e moda; TV/televisor usam cenário de tecnologia.

## Arquitetura do módulo

```text
GeminiPromptOffer
  ↓
numeroPorExtenso()
precoPorExtenso()
precoFalavelCurto()
  ↓
normalizeTechnicalSpecsForSpeech()
simplifyCommercialNameForSpeech()
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

### Air Fryer

```text
Fritadeira Air Fryer Britânia BAF95A 9,5L Painel Digital 1800W
→ Air Fryer Britânia
```

Locução esperada:

```text
Olha esse achado! Air Fryer Britânia, por quinhentos e quarenta e nove reais. Confira na publicação!
```

### Smartphone

```text
Smartphone Samsung Galaxy A55 256GB 5G Bluetooth
→ Smartphone Samsung Galaxy A55
```

### iPhone

```text
Apple iPhone 15 128GB 5G
→ Apple iPhone 15
```

### TV

```text
Smart TV Samsung 50\" 4K QLED HDR
→ Smart TV Samsung
```

### Notebook

```text
Notebook Lenovo IdeaPad Slim 3 512GB 16GB Full HD Wi-Fi
→ Notebook Lenovo IdeaPad Slim 3
```

## Compatibilidade com o fluxo atual

`VideosClient.tsx` continua chamando `buildGeminiVideoPrompt(selectedOffer)` sem mudança de contrato. `POST /api/videos/jobs` também não exige mudança e continua persistindo o prompt efetivamente utilizado.

## Validação de duração

Não é imposto um bloqueio rígido de 8 segundos no backend. O padrão de 8 segundos é aplicado no próprio prompt, preservando compatibilidade com vídeos legados e pequenas variações do gerador.

## Testes automatizados

`src/tests/videos/gemini-prompt.test.ts` cobre:

- estrutura de 8 segundos e limite de palavras;
- prioridade de `short_name` e preço falável curto;
- normalização de especificações técnicas de Air Fryer, smartphone, TV e notebook;
- remoção de código técnico `BAF95A`;
- simplificação `Fritadeira Air Fryer` → `Air Fryer`;
- preservação de modelos comerciais como `Galaxy A55`, `iPhone 15` e `IdeaPad Slim 3`;
- cenários e interações por categoria;
- manutenção da forma longa do preço para usos futuros.

## Critérios de aceite

- O prompt deve declarar vídeo de 8 segundos.
- A avatar e o produto devem permanecer visualmente consistentes.
- A locução deve priorizar `short_name`.
- Especificações e códigos técnicos dispensáveis devem ser removidos apenas da fala, nunca dos dados da oferta.
- Nomes comerciais reconhecíveis devem ser preservados quando agregam identificação ao produto.
- Redundâncias comerciais devem ser simplificadas quando economizam tempo sem perder identidade.
- A locução deve utilizar preço falável curto e fallback por limite de palavras.
- O prompt deve proibir texto, legenda, números e marca d'água na tela.
- A fala deve terminar antes do fim do vídeo.
- O contrato público de `buildGeminiVideoPrompt(offer)` e o backend de importação não devem mudar.

## Arquivos alterados

- `docs/VIDEO_PROMPT_8S_IMPLEMENTATION.md`
- `src/lib/videos/gemini-prompt.ts`
- `src/tests/videos/gemini-prompt.test.ts`

## Próximos passos possíveis

- Gerar `short_name` automaticamente na ingestão de ofertas quando o marketplace não fornecer um nome adequado.
- Registrar no metadata a contagem de palavras e a versão de template usada.
- Criar presets futuros de 8, 15 e 30 segundos mantendo a mesma arquitetura.
