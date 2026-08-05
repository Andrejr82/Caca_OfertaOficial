# Desativação de Ofertas para Facebook e Instagram no Painel

**Data:** 05 de Agosto de 2026
**Objetivo:** Interromper o envio e a geração de ofertas (rascunhos) para as redes sociais Facebook e Instagram, focando a operação apenas no Telegram e WhatsApp.

## Análise do Fluxo e Causa Raiz
O sistema possui duas frentes atuando na criação de uma postagem:
1. **Robô (Oracle Scraper):** Varre as lojas (Shopee, Amazon, ML) e gera os links de afiliados primários. Ele usava um array `AFFILIATE_CHANNELS` para determinar quais links deveriam ser construídos e atrelados à oferta (`tg_`, `wp_`, `fb_`, `ig_`).
2. **Cérebro de IA (Vercel API):** Ao receber o gatilho do robô, a rota `/api/ai/generate/route.ts` decidia quais textos (copies) criar baseando-se na função `resolveOfficialAIChannels()`. Como ela retornava todos os 4 canais, a IA gerava 4 rascunhos por produto e os enviava para a tabela `posts`, o que populava as 4 abas do painel.

## Solução Aplicada

### 1. Painel Front-end e IA (Vercel)
**Arquivo:** `src/app/api/ai/generate/route.ts`
A função `resolveOfficialAIChannels` foi modificada para excluir as redes indesejadas, ficando estritamente focada nas ativas.

**Antes:**
```typescript
function resolveOfficialAIChannels(): readonly OfficialAIChannel[] {
  return hasFacebookEnv()
    ? ["telegram", "instagram", "whatsapp", "facebook"]
    : ["telegram", "instagram", "whatsapp"];
}
```

**Depois:**
```typescript
function resolveOfficialAIChannels(): readonly OfficialAIChannel[] {
  return ["telegram", "whatsapp"];
}
```

### 2. Robô Caçador (Oracle)
**Arquivo:** `scripts/oracle-scraper.cjs`
O array `AFFILIATE_CHANNELS` foi enxugado. Isso poupa recursos de banco de dados (menos linhas geradas em `affiliate_links`) e processamento.

**Antes:**
```javascript
const AFFILIATE_CHANNELS = Object.freeze([
  { name: 'telegram', prefix: 'tg_' },
  { name: 'whatsapp', prefix: 'wp_' },
  { name: 'facebook', prefix: 'fb_' },
  { name: 'instagram', prefix: 'ig_' },
]);
```

**Depois:**
```javascript
const AFFILIATE_CHANNELS = Object.freeze([
  { name: 'telegram', prefix: 'tg_' },
  { name: 'whatsapp', prefix: 'wp_' },
]);
```

## Resultado Esperado
A partir da aplicação, o Oracle Scraper só gera links para TG e WP. Ao engatilhar a API da Vercel, a Inteligência Artificial só produz os textos de Telegram e WhatsApp. As abas do Facebook e Instagram no painel pararão de receber novas ofertas imediatamente.
