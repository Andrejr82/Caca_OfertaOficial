# Arquitetura (estado atual)

## Arquitetura física

### Componentes

- **Windows (desenvolvimento/execução local)**
  - Executa o app Next.js local (`npm run dev`) e scripts auxiliares quando necessário.
- **Vercel**
  - Hospeda o app Next.js (UI + rotas `/api/*`).
  - Executa cron definido em `vercel.json` (hoje: `GET /api/instagram/poll-comments`).
- **Oracle (VPS)**
  - **WhatsApp Engine**: `scripts/whatsapp-engine.cjs` (Express + Baileys) na porta `3001`.
  - **Oracle API**: `scripts/oracle-api.cjs` (Express) na porta `3002`, endpoint `POST /api/scrape`.
  - **Oracle Scraper**: `scripts/oracle-scraper.cjs` (processo longo + `node-cron`) com scraping (Crawlee/Playwright) e escrita no Supabase.
- **Supabase**
  - PostgreSQL + Auth + Storage (state central do sistema).
- **Redes Sociais / Plataformas**
  - WhatsApp (Newsletter via Baileys no Oracle)
  - Telegram (Bot API)
  - Instagram (Meta Graph API + Webhook)
  - Facebook (Meta Graph API)
  - GitHub Actions (renderização/publicação de Reels em workflow específico)

### Diagrama (visão física exigida)

```mermaid
flowchart TB
  W[Windows] --> O[Oracle (VPS)]
  O --> S[(Supabase)]
  S --> V[Vercel (Next.js)]
  V --> R[Redes Sociais]
```

### Diagrama (visão física detalhada)

```mermaid
flowchart TB
  subgraph W[Windows]
    W1[Next.js local (npm run dev)]
    W2[Scripts auxiliares (scripts/*)]
  end

  subgraph O[Oracle (VPS)]
    O1[WhatsApp Engine :3001\nscripts/whatsapp-engine.cjs]
    O2[Oracle API :3002\nscripts/oracle-api.cjs]
    O3[Oracle Scraper\nscripts/oracle-scraper.cjs]
  end

  subgraph S[Supabase]
    S1[(PostgreSQL)]
    S2[(Auth)]
    S3[(Storage)]
  end

  subgraph V[Vercel]
    V1[Next.js (UI + /api/*)]
    V2[Cron vercel.json\n/api/instagram/poll-comments]
  end

  subgraph R[Redes Sociais / Plataformas]
    R1[Telegram Bot API]
    R2[WhatsApp (Baileys/Newsletter)]
    R3[Instagram Graph API]
    R4[Facebook Graph API]
    R5[GitHub Actions (workflow)]
  end

  W1 --> V1
  V1 --> S1
  O3 --> S1
  V1 --> O2
  V1 --> O1

  V1 --> R1
  O1 --> R2
  V1 --> R3
  V1 --> R4
  V1 --> R5
```

## Arquitetura lógica

### Domínios e responsabilidades

- **Ofertas**
  - Persistência e estado em `public.offers` (Supabase).
  - Origem: ingestão por scraping e/ou APIs de importação.
- **Rastreamento (tracking)**
  - Links por canal em `public.affiliate_links` e redirecionador `/go/:subId`.
  - Eventos de clique em `public.click_events` (via evento do Inngest disparado em `/go/:subId`).
- **Publicação**
  - Rascunhos e histórico em `public.posts`.
  - Canais:
    - Telegram: publicação direta via Bot API.
    - WhatsApp: publicação indireta via motor Oracle (HTTP + API key).
    - Instagram: dois caminhos no código:
      - Publicação via Meta Graph API (imagem e/ou Reels).
      - Disparo de GitHub Actions para renderização e publicação de Reels.
    - Facebook: publicação via Graph API quando configurado.
- **Observabilidade**
  - Logs de integrações em `public.integration_logs`.
  - Logs de copy (estratégia/modelo/score) em `public.ai_copy_logs`.
- **Segurança/Auditoria**
  - Perfis em `public.profiles` e logs em `public.audit_logs`.

### Diagrama (fluxo lógico principal)

```mermaid
flowchart TB
  subgraph Ingestao[Ingestão]
    A1[/api/scraper/trends\n(Vercel)/]
    A2[Oracle Scraper\n(scripts/oracle-scraper.cjs)]
    A3[Oracle API\n(scripts/oracle-api.cjs)]
  end

  subgraph Core[Core]
    B1[(offers)]
    B2[(affiliate_links)]
    B3[(posts)]
    B4[(integration_logs)]
    B5[(ai_copy_logs)]
    B6[(click_events)]
  end

  subgraph Exec[Execução]
    C1[/api/ai/generate/]
    C2[/api/telegram/publish/]
    C3[/api/whatsapp/publish/]
    C4[/api/instagram/publish/]
    C5[/api/facebook/publish/]
    C6[/go/:subId/]
    C7[Inngest (/api/inngest)]
  end

  A1 --> A3
  A1 --> C1
  A2 --> B1
  A2 --> B2
  A2 --> B3
  A2 --> B4

  C1 --> B2
  C1 --> B3
  C1 --> B1
  C1 --> B5

  C2 --> B3
  C3 --> B3
  C4 --> B3
  C5 --> B3

  C6 --> C7
  C7 --> B6
  C7 --> B2
```
