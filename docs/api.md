# Referência de APIs Internas

A aplicação utiliza as `API Routes` nativas do Next.js (em `src/app/api/`) para expor lógicas complexas e integrar com plataformas externas. A autenticação geralmente baseia-se na captura de Sessões ativas do Supabase no lado do servidor.

## Endpoints de Scraping e Entrada de Dados

### `POST /api/scraper/import`
- **Uso:** Importa uma oferta bruscamente, normalmente chamado pela Extensão do Chrome ou integrações de terceiros.
- **Payload:** `{ original_url: string }`

### `POST /api/scraper/trends`
- **Uso:** Busca dados de ofertas "quentes" de redes de afiliados em lote e armazena os metadados raw.

### `GET/POST /api/scraper/cron`
- **Uso:** Acionador programado para agendar e coordenar varreduras. (Pode estar sob transição total para o Inngest).

## Endpoints de Inteligência Artificial

### `POST /api/ai/generate`
- **Uso:** Transforma o metadado raw de uma oferta (já inserida) em copys persuasivas, gerando e rastreando os *Affiliate Links* no processo.
- **Payload:** `{ offerId: string }`
- **Resumo:** Recupera o `offerId`, cria rastreio para Telegram, WhatsApp e Instagram, atrela UTMs, pede à IA a cópia formatada, salva os novos `posts` como draft e devolve as opções de postagem ao frontend.

## Endpoints de Publishing (Disparo)

### `POST /api/publish/extension`
- **Uso:** Endpoint auxiliar para que a extensão envie publicações diretamente a partir de um JSON mastigado.

### `POST /api/telegram/publish`
- **Uso:** Aprova e efetua o envio de um post via REST para o Canal do Telegram do usuário logado.

### `POST /api/instagram/publish`
- **Uso:** Aciona a API Oficial Graph do Instagram, postando a oferta já validada pelo sistema.

### `POST /api/whatsapp/publish`
- **Uso:** Atualmente atualiza a fila (tabela `posts` ou webhook associado) para que o Worker independente dispare o push.

## Endpoints de Orquestração (Inngest)

### `GET / POST / PUT /api/inngest`
- **Uso:** Usado inteiramente pelos servidores da Inngest. Contém funções registradas (como `publishPostBackground`, `runUserScrapingBackground`). 
- **Aviso:** Nunca chame este endpoint do cliente. Acione os eventos da Inngest usando a biblioteca padrão.

## Endpoints Utilitários

### `GET /api/img`
- **Uso:** Usado como proxy reverso para contornar problemas de CORS ao renderizar imagens externas (de marketplaces) em canvas locais.

### `GET / POST / PUT /api/settings/*`
- **Uso:** Gestão de tokens de acesso (users, configs, connection-tests, audit logs).
