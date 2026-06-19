# Arquitetura do Sistema

O Caça Oferta Oficial é desenhado como um monolito modular na Vercel utilizando Next.js (App Router) como core, aliado a serviços de banco de dados e mensageria distribuída.

## Visão Geral

```mermaid
graph TD;
    subgraph Frontend [Next.js Client Components]
        Dashboard[Painel do Operador]
        Login[Autenticação]
    end

    subgraph Backend [Next.js Server / API Routes]
        API_AI[Geração de Copy via IA]
        API_Publish[Disparo de Mensagens]
        API_Tracking[Geração de SubIDs]
    end

    subgraph Database [Supabase]
        Auth[Autenticação]
        Postgres[PostgreSQL]
        Storage[Armazenamento Imagens]
    end

    subgraph Background [Workers & Filas]
        Inngest[Orquestração Assíncrona]
        Baileys[Motor WhatsApp Web]
    end

    subgraph ThirdParty [Integrações Externas]
        Telegram[Telegram Bot API]
        Groq[Groq / Gemini LLM]
        Scraping[APIs Scraper]
    end

    Dashboard -->|Server Actions| Backend
    Login -->|JWT| Auth
    Backend -->|RLS| Postgres
    Backend -->|Upload| Storage
    Backend -->|Prompt| Groq
    Backend -->|Queue Event| Inngest
    Backend -->|Webhook| Telegram
    Baileys -->|Polls| Postgres
    Baileys -->|Sends| WhatsApp
```

## Componentes Principais

### Frontend (Next.js 16)
Utiliza a nova infraestrutura do React 19 e App Router (`src/app`). As páginas principais interagem com componentes isolados (`src/components`) utilizando Tailwind CSS para estilos.

### Banco de Dados (Supabase)
Atua como camada de persistência definitiva. As chaves de acesso são separadas em "Anon Key" (com segurança a nível de linha - RLS) para clientes, e "Service Role Key" exclusiva do ambiente Node.js.

### Motor de Copywriting (IA)
A geração de persuasão (`src/lib/ai/`) constrói um payload baseado no desconto e dados brutos, enviando para LLMs como o Groq/Gemini, que retornam em um schema JSON predeterminado com `headline`, `hook`, `body` e `cta`.

### Distribuição (Publishing)
Cada oferta possui N links de afiliado rastreados (um para cada canal). A postagem no Telegram ocorre imediatamente pela sua API HTTP nativa. A postagem no WhatsApp exige um processo persistente (`scripts/whatsapp-engine.cjs`) utilizando websockets via biblioteca `baileys` para se conectar a um aparelho celular.
