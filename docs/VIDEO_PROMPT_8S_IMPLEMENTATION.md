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

A alteração deve permanecer centralizada no builder de prompt para não duplicar regras na interface.

## Problema identificado

A implementação anterior concatenava título do produto, marketplace, preço por extenso e CTA em uma única locução. Em produtos com nomes comerciais longos, a fala ultrapassava o que cabe naturalmente em 8 segundos, causando aceleração, omissão ou corte das últimas palavras.

Além disso, o prompt visual era escrito como um único parágrafo e não dava prioridade explícita à duração, ao timing da fala e à finalização antes do encerramento do vídeo.

## Estratégia adotada

### 1. Duração alvo

- Duração declarada no prompt: **8 segundos**.
- A fala deve começar imediatamente.
- A última palavra deve terminar antes do final do vídeo.
- Reserva visual de aproximadamente 0,3 segundo após a última palavra.

### 2. Nome falável do produto

A locução usa `short_name` quando disponível. Se ele não existir, o sistema usa `product_name` com uma normalização básica para remover especificações que costumam alongar a fala, como tensão elétrica (`127V`, `220V`) e separadores finais.

O nome completo do produto continua disponível para card, banco, publicação e demais fluxos.

### 3. Preço falável curto

O preço do vídeo usa uma forma mais compacta. Exemplo:

- `R$ 471,80`
- forma longa: `quatrocentos e setenta e um reais e oitenta centavos`
- forma curta: `quatrocentos e setenta e um e oitenta`

A forma longa permanece disponível no módulo para usos futuros.

### 4. Limite de palavras

A geração usa um teto de palavras para a locução de 8 segundos. O roteiro tenta primeiro uma versão comercial completa e, se exceder o limite, usa uma versão compacta.

O limite adotado é conservador e serve como proteção de produto; ele não substitui o comportamento do modelo de vídeo, mas reduz bastante a chance de fala cortada.

### 5. Prompt estruturado

O prompt final passa a ser dividido em blocos semânticos:

- PERSONAGEM
- PRODUTO
- CENA
- ATUAÇÃO
- CÂMERA
- ÁUDIO E LIPSYNC
- FALA EXATA
- QUALIDADE
- RESTRIÇÕES

Isso facilita a leitura humana e reduz conflito entre instruções visuais e de áudio.

### 6. Inteligência visual existente preservada

As regras por categoria continuam válidas:

- produto em bancada para cafeteira, liquidificador, air fryer etc.;
- produto nas mãos para smartphone, controle, headset etc.;
- ambientes coerentes com cozinha, tecnologia, beleza, moda e demais categorias.

## Arquitetura do módulo

`src/lib/videos/gemini-prompt.ts` passa a seguir a sequência:

```text
GeminiPromptOffer
  ↓
numeroPorExtenso()
precoPorExtenso()
precoFalavelCurto()
  ↓
getSpeakableProductName()
wordCount()
  ↓
productInteraction()
studioBackground()
  ↓
speechScript8Seconds()
  ↓
buildGeminiVideoPrompt()
```

## Exemplo

Produto:

```text
3 Corações TRES Cafeteira Espresso e Multibebida Passione Branca - 127V
```

Nome falável esperado, quando `short_name` estiver preenchido:

```text
Cafeteira Três Corações Passione
```

Preço:

```text
R$ 471,80
```

Locução preferencial:

```text
Olha esse achado! Cafeteira Três Corações Passione, por quatrocentos e setenta e um e oitenta. Confira na publicação!
```

Caso a contagem exceda o teto configurado, o prefixo é removido e uma locução compacta é usada.

## Compatibilidade com o fluxo atual

### `VideosClient.tsx`

Continua chamando `buildGeminiVideoPrompt(selectedOffer)` sem mudança de contrato. Apenas o texto de orientação da importação é atualizado para indicar 8 segundos como formato recomendado.

### `POST /api/videos/jobs`

Nenhuma mudança necessária. O endpoint continua recebendo:

```json
{
  "offerId": "...",
  "driveFileId": "...",
  "driveFileName": "...",
  "prompt": "..."
}
```

O prompt usado continua sendo salvo no job e em `metadata.prompt`.

## Validação de duração

Nesta primeira versão, **não será imposto um bloqueio rígido de 8 segundos no backend**. A validação técnica existente permanece ampla para evitar quebra de vídeos legados e tolerar pequenas diferenças de duração produzidas pelo gerador.

A interface passa a recomendar:

```text
MP4 vertical 9:16 · 8 segundos
```

Uma etapa futura poderá aplicar tolerância específica, por exemplo de 7 a 10 segundos, para novos vídeos.

## Critérios de aceite

- O prompt deve declarar vídeo de 8 segundos.
- A avatar deve permanecer visualmente consistente.
- O produto deve permanecer fiel à imagem de referência.
- O cenário e a interação devem continuar dinâmicos por categoria.
- A locução deve priorizar `short_name`.
- A locução deve utilizar preço falável curto.
- A locução deve possuir fallback automático quando ultrapassar o teto de palavras.
- O prompt deve proibir texto, legenda, números e marca d'água na tela.
- A fala deve ser instruída a terminar antes do fim do vídeo.
- O contrato público de `buildGeminiVideoPrompt(offer)` não deve mudar.
- O backend de importação não deve exigir alterações.

## Próximos passos possíveis

- Gerar `short_name` automaticamente na ingestão de ofertas quando o marketplace não fornecer um nome adequado.
- Criar testes unitários para nomes longos, preços com e sem centavos e diferentes categorias.
- Registrar no metadata a contagem de palavras e a versão de template usada.
- Criar presets futuros de 8, 15 e 30 segundos mantendo a mesma arquitetura.
