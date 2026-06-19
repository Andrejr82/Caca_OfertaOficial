# 📚 DOCUMENTAÇÃO CONSOLIDADA V2 - CAÇA OFERTA OFICIAL
*Versão definitiva e purificada, baseada 100% na realidade do código-fonte atual. Toda e qualquer funcionalidade ou integração descrita aqui possui prova e evidência em código.*

---

## 1. Visão Geral
O **Caça Oferta Oficial** é um sistema web administrativo (painel afiliado) voltado para centralizar e automatizar a descoberta de promoções em e-commerces, geração inteligente de copys persuasivas através de IA e disparos multicanal de links trackeados para redes sociais (Telegram, Instagram e WhatsApp).

## 2. Objetivo
Atuar como um hub centralizado que poupa tempo do administrador/afiliado, transformando um simples link bruto de um produto em um pacote pronto para vendas com: imagem resolvida, preço atualizado, copy persuasiva gerada via IA e postagem facilitada (ou automatizada) nos canais da marca.

## 3. Arquitetura
A arquitetura atual opera em um modelo híbrido (Serverless + Servidor Dedicado):
- **Aplicação Core:** Next.js 14/15 (App Router), desenvolvida em TypeScript, renderizando React e TailwindCSS. Funciona plenamente em ambientes serverless (Vercel).
- **Servidor Secundário Obrigatório (WhatsApp Engine):** Como o projeto não utiliza a API Oficial da Nuvem da Meta, ele depende de um microserviço Express em Node.js (`scripts/whatsapp-engine.cjs`) utilizando a biblioteca `@whiskeysockets/baileys`. Esse motor roda na porta 3001 e necessita ser mantido vivo localmente (ou em um container dedicado) para que os disparos de WhatsApp funcionem.

## 4. Fluxo de Negócio
1. **Entrada do Link:** O usuário insere um link de produto (Shopee, Amazon, Magalu, ML, Shein).
2. **Scraping Híbrido:** O backend invoca o `scraper.ts`. Tenta extrair Título, Preço e Imagem via Firecrawl API. Se falhar, realiza requisição nativa (Fetch HTTP) e extrai via Regex, Meta Tags e `JSON-LD`.
3. **Injeção de Tracking:** Um `sub_id` é gerado unindo ID da Oferta e Canal. A URL é mascarada/trackeada no padrão da loja via base de dados.
4. **Inteligência Artificial:** O objeto do produto é enviado via API REST para a plataforma Groq. A IA retorna um JSON estruturado com múltiplas estratégias de copywriting (urgência, benefício, etc) e a oferta recebe um "Score".
5. **Aprovação Manual ou Automática:** Rascunhos (`draft`) são criados.
6. **Distribuição:** O usuário manda publicar. O sistema consome as APIs do Telegram e Instagram diretamente ou repassa a ordem via HTTP POST para o `whatsapp-engine.cjs`.

## 5. Banco de Dados
**Tecnologia:** Supabase (PostgreSQL). Toda iteração é baseada no pacote `@supabase/ssr`.
A estrutura ativa real mapeada pelo `schema.sql` consiste em **7 Tabelas Principais** (sem o uso de Views ou Triggers customizados):
- `profiles`: Vinculado via foreign key cascata com `auth.users`.
- `offers`: Central de ofertas.
- `affiliate_links`: Rastreador de sub_ids e controle de contagem de cliques (`clicks`).
- `posts`: Histórico e rascunhos com seu devido `channel` (Telegram, Instagram, WhatsApp) e status.
- `sales`: Registro manual ou webhooks futuros de vendas realizadas.
- `integration_logs`: Auditoria em JSONB.
- `app_settings`: Configurações de sistema no formato key/value.

## 6. APIs (Endpoints do Sistema)
O Next.js exporta algumas rotas REST cruciais na pasta `src/app/api`:
- **`/api/scraper/cron`**: Rota responsável por desencadear a varredura automática, coleta, aprovação e rascunho.
- **`/api/ai/generate`**: Endpoint interno que orquestra a comunicação do Front-End com a lógica de IA (Groq).
- **`/api/telegram/publish`**: Envia os payloads diretamente ao bot do Telegram.
- **`/go/[subId]`**: Engine dinâmica de roteamento e redirecionamento de cliques do usuário final até a loja.

## 7. Integrações
- **Telegram:** ✅ Implementado via Bot API (`https://api.telegram.org/bot<TOKEN>`). Suporta fotos e textos (`sendMessage` e `sendPhoto`).
- **Instagram:** ✅ Implementado via Facebook Graph API. Criação de media container (`/media`), polling aguardando status `FINISHED` e publicação final (`/media_publish`).
- **Firecrawl:** ✅ Implementado em `scraper.ts` como extrator estruturado principal, extraindo esquema JSON para preço e imagens.
- **WhatsApp:** ⚠️ Adaptado via biblioteca Baileys (não oficial).
- **Marketplaces Oficiais (Amazon, Shopee, etc):** ❌ Ausente. Não foram localizados SDKs ou integrações com as plataformas nativas de Afiliados. Toda extração baseia-se exclusivamente em Web Scraping HTML/JSON-LD.
- **Facebook / TikTok:** ❌ Inexistente. Apenas UI/Configurações inertes no código.

## 8. Inteligência Artificial (IA)
A aplicação possui um motor focado em **Copywriting Persuasivo**.
- **Provedor Real:** `Groq API` (e não Gemini).
- **Implementação:** Arquivo `src/lib/ai/groq.ts`.
- **Funcionamento:** O código envia um System Prompt exigindo retorno em JSON de 4 copys distintas (Urgência, Benefício, Emoção, Curiosidade), extraindo Headline, Gancho, Corpo e CTA. 
- **Confiabilidade:** Possui fila interna de limite e retentativas configuradas (`retries`), providenciando fallback estático em caso de falha completa (exaustão da cota).
- **Score:** O Score avaliado (coluna `score` em `offers`) é apenas uma nota simples baseada no percentual de desconto, presença de cupom e avaliação média. Não usa IA para prever "chance de conversão".

## 9. Publicações
O ciclo de publicação ocorre canal a canal:
- **Telegram:** Síncrono e direto pela borda web (`fetch` nativo com o bot token).
- **Instagram:** Requer polling síncrono. O Next.js envia o comando, espera o servidor da Meta digerir a imagem, e envia o publicador.
- **WhatsApp:** O sistema faz um POST inseguro (`http://localhost:3001/send`) para o script Baileys informando a ID do grupo/newsletter, que enfileira nativamente para o WebSocket do WhatsApp.

## 10. Automações
- **Cron Jobs / Agendamentos:** Existe uma rota exposta `/api/scraper/cron/route.ts` que precisa ser engatilhada periodicamente por um orquestrador externo (ex: Vercel Cron Jobs). Para validar a segurança, ela exige um header de autenticação cruzado com a chave `CRON_SECRET`.
- **Workers:** ❌ Ausente (exceto pela gambiarra de servir o Baileys como servidor contínuo). Não existe Redis ou BullMQ gerindo filas em background reais.

## 11. Segurança
- **Banco de Dados (Supabase RLS):** 100% Protegido. O código exige o `auth.uid()` para qualquer `select`, `insert`, `update` ou `delete`, garantindo segurança Multi-tenant.
- **Proteção de Bucket:** O bucket `offer-images` é privado e obedece RLS restritivo de UID por pasta.
- **Ponto de Falha (Baileys):** O servidor express local da porta 3001 que dispara para o WhatsApp não valida Header, API Keys nem CORS com rigor de infraestrutura isolada, sendo um vetor interno.
- **Supabase Admin:** O projeto expõe chamadas para Client de admin bypassing RLS para ações de sistema via variável `SUPABASE_SERVICE_ROLE_KEY`.

## 12. Deploy
- **Front-End / Back-End (Next.js):** Planejado para o ecossistema Vercel / Netlify de forma Serverless ou Edge.
- **Integração Externa (WhatsApp):** Quebra o formato Serverless, necessitando de Virtual Private Server (VPS), Container Docker Contínuo ou Máquina Local ligada na rede para persistir a pasta de credenciais `.baileys_auth`.

## 13. Monitoramento
- Não há configuração de monitoramento avançado no código, tais como Sentry, Datadog ou Prometheus. 
- O monitoramento se restringe a logs no console via o pacote `pino` (configurado silenciosamente) e auditorias cruas na tabela `integration_logs` dentro do banco de dados (que mapeia success/error das requisições).

## 14. Roadmap Factual e Débitos Técnicos
A partir do que já existe hoje no código, o progresso real fica em:
- **Fase Completa:** Core System, Scraping Híbrido, Identidade/Segurança e Geração de Copys de IA.
- **Falta Implementar / Aprimorar:** Migração de WhatsApp do Baileys para a Nuvem Oficial (Cloud API). Implementação verdadeira de endpoints de webhooks para contabilizar faturamento real em `sales` via integração de plataformas. Fazer a conexão de afiliados da Shopee/Amazon via APIs deles e não por raspagem instável.

## 15. Limitações Críticas
1. **Quebra de Scraping:** A extração do "Mercado Livre" e "Amazon" se baseia em regex e classes de CSS (ex: `a-price-whole`). Se a plataforma mudar seu design frontend amanhã, o scraper falhará em pegar o preço.
2. **Concorrência (Rate Limit Groq):** O limite de fila interno pode explodir a memória do ambiente Vercel Functions se o Cron de 100 ofertas for executado simulaneamente.
3. **Serverless vs Stateful:** A arquitetura do projeto possui um conflito central, prometendo uma "API escalável moderna em Next.js", mas possuindo um calcanhar de aquiles em estado constante (`whatsapp-engine.cjs`). Essa divergência encarece custos de infraestrutura e aumenta o tempo offline.
