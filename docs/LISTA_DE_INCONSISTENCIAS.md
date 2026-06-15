# Lista de Inconsistências (A Verdade vs A Documentação)

Esta tabela mapeia o abismo e as divergências entre o que poderia estar listado em documentações conceituais antigas versus a realidade cristalina encontrada na lógica de código real.

## Tabela de Inconsistências Obrigatória

| Funcionalidade | Documentação Prévia/Expectativa | Código Real (Evidência) | Status |
| -------------- | ------------------------------- | ----------------------- | ------ |
| **Integração Shopee, Amazon, Magalu** | Integração com marketplaces por API Oficial de Parceiros/Afiliados. | O código apenas raspa o HTML aberto usando `fetch` ou `Firecrawl API` em `src/lib/publish/scraper.ts`. | ⚠️ DESATUALIZADO / INVENTADO |
| **Integração WhatsApp** | Envios integrados nativamente com a nuvem / automação fluida. | Um servidor à parte precisa ser inicializado localmente (`scripts/whatsapp-engine.cjs`) para ler um QR Code via terminal. | ⚠️ DESATUALIZADO |
| **Worker / Background Jobs** | O sistema roda robôs persistentes em background (Filas). | Não há Redis ou BullMQ. Apenas um endpoint `/api/scraper/cron/route.ts` que **depende de serviço externo** bater nele para rodar. | ⚠️ DESATUALIZADO |
| **Ranqueamento (Ranking de Ofertas)** | IA poderosa que cruza centenas de dados para rankear ofertas ativas de forma inteligente. | O `score` é apenas uma fórmula matemática simples calculando porcentagem de desconto + bônus de 1 ponto se tem cupom (`src/lib/ai/groq.ts` fallback). | ⚠️ DESATUALIZADO |
| **Integração Facebook** | Automação de postagens em Páginas e Grupos. | Existe uma página `facebook/page.tsx` apenas para renderizar uma tabela de histórico. Sem motor real de envio. | ❌ INVENTADO |
| **Integração TikTok** | Integração na suíte de redes sociais. | Só há uma constante vazia em `src/config/socials.ts`. | ❌ INVENTADO |
| **Uso do Modelo Gemini** | Regras antigas de sistema afirmavam usar o *Gemini 2.5 Flash-Lite*. | O arquivo ativo é `src/lib/ai/groq.ts` apontando para a *API da Groq* (modelo LLaMA ou Mistral). | ⚠️ DESATUALIZADO |
| **Supabase Automations (Triggers)** | Automação no banco e triggers de processos. | O banco possui apenas Tabelas e RLS. Nenhum trigger de DML foi criado (`supabase/schema.sql`). | ⚠️ DESATUALIZADO |

### Resumo das Retificações:
- **O que está correto:** O módulo de scraping funciona; a inteligência artificial gera os copys; Instagram e Telegram publicam perfeitamente; Autenticação e Segurança (RLS) são impecáveis.
- **O que está errado:** Acreditar que a aplicação é serverless-ready 100% autônoma. O fato de depender do `whatsapp-engine.cjs` rodando num terminal quebra o ciclo "100% autônomo em nuvem".
- **O que falta documentar:** É imperativo documentar para os próximos Devs que o `CRON_SECRET` precisa ser cadastrado no `Vercel Cron` (ou similar) batendo na rota `/api/scraper/cron/route.ts?token=...` para que o robô faça varredura diária das ofertas.
