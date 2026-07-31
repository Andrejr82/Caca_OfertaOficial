# Estado atual do sistema

Atualizado em 31/07/2026. Baseado no checkout local e no código versionado; disponibilidade externa de Vercel, Supabase, Oracle e Meta precisa ser confirmada no ambiente correspondente.

## Runtime

- Next.js/Vercel: painel, APIs, Official AI, Copy V2, Publicação Expressa e transportes sociais.
- Supabase: ofertas, links, posts, auditoria, classificação e storage.
- Oracle: Discovery-Only de Shopee, Mercado Livre e Amazon; API técnica de scraping; motor WhatsApp separado.
- Scheduler do Oracle Worker: seis janelas em `America/Sao_Paulo` (`00h`, `04h`, `08h`, `12h`, `16h`, `20h`) com `noOverlap`.
- Canais implementados: Telegram, Instagram, Facebook e WhatsApp via transportes próprios. WhatsApp Baileys depende de estado externo e pode ser bloqueado pelo provedor.

## IA e copies

- Official AI é a autoridade de geração e regeneração.
- Discovery automática mantém a oferta em `pending_manual_review`.
- Publicação Expressa usa Copy V2 somente após confirmação do produto e monetização, mantendo revisão manual.
- A IA não decide seleção, preço, desconto ou compliance; recebe dados comprovados e redige o conteúdo.

## Qualidade e marketplaces

Shopee, Mercado Livre e Amazon possuem contratos de discovery separados. A flag `OFFER_QUALITY_PIPELINE_V2` continua documentada em `.env.example`; o modo efetivo deve ser confirmado no ambiente Oracle antes de declarar ativação.

## Vídeos

O worker atual usa TTS, FFmpeg e runtime MuseTalk configurável. Lightning AI não é dependência operacional obrigatória.

## Fonte de verificação

Commit documental atual: `970aa6f` (31/07/2026). O SHA não comprova deploy externo; validar Vercel, Oracle, Supabase e PM2 separadamente.
