# Roadmap Real (Baseado no Código-Fonte)

Lista detalhada das funcionalidades separadas por status de desenvolvimento real detectado no repositório no momento atual da auditoria.

## ✅ Já implementado (Funcionando 100% no Código)
- **Autenticação via Supabase**: Fluxo SSR, roles e base segura.
- **Isolamento de Tenant (RLS)**: Cada usuário da plataforma tem dados restritos aos seus UUIDs em todas as tabelas.
- **Scraper Híbrido**: Resolução de redirecionamentos HTTP, extração via Firecrawl, e em caso de falha, extração avançada por Meta Tags e Schema.org (JSON-LD).
- **Integração Groq (IA)**: Módulo de Copywriting Inteligente gerando 4 estratégias (Benefício, Urgência, Emoção, Curiosidade) por produto mapeado.
- **Integração Instagram**: Envio via Graph API suportando upload de fotos e legendas complexas.
- **Integração Telegram**: Publicação automática em canais/grupos com texto formatado e fotos associadas a links.
- **Roteamento de Cliques (Tracking)**: Acesso via `/go/[subId]` funciona para redirecionamento.
- **Suite de Testes Base**: Configuração estruturada para Vitest e contratos.

## ⚠️ Parcialmente implementado (Necessita Ajustes ou Refatorações)
- **Motor de Publicação WhatsApp**: 
  - Código: Está feito via microserviço em `scripts/whatsapp-engine.cjs`. 
  - Problema: Exige que um terminal rode constantemente com Node.js paralelo ao Next.js e faça leitura de QRCode manual. Se derrubar o terminal, a integração no painel para de funcionar. O ambiente não é ideal para deploy Serverless (como Vercel).
- **Ranking / Scoring de Ofertas**:
  - Código: Existe a coluna `score` na tabela `offers` e lógicas básicas (desconto gera notas de 5.0 a 10.0), mas não há motor maduro de machine learning ou feed rotativo automático baseado nesses scores.
- **Dashboard de Vendas (Sales Dashboard)**:
  - Código: Componente JSX encontrado em `src/components/dashboard/sales-dashboard.tsx` e tabela `sales` criada no banco. Mas integração sistêmica (webhook das lojas notificando vendas reais para baixa do BD) não foi evidenciada.

## ❌ Falta implementar (Não Localizado no Código)
- **Integrações de API Oficial dos Marketplaces**: 
  - Variáveis para Shopee/Amazon/Magalu estão em `.env.example`, mas no código real todo acesso é por "Scraping/Crawling". Nenhuma chamada para APIs Oficiais de Afiliado destas redes foi confirmada.
- **Cloud API do WhatsApp**: 
  - O código não usa a "WhatsApp Cloud API" oficial da Meta. Requer migração caso o objetivo seja escalar para múltiplos números corporativos pesados.
- **Controle Dinâmico/Automático Completo (Cron Global)**: 
  - Um cron está em `src/app/api/scraper/cron/route.ts`, porém a arquitetura Serverless (Vercel) precisa de gatilhos externos configurados (Vercel Cron ou cron-job.org) que não são inferíveis pelo código atual.
