# Relatório de Migração Arquitetural

## Resumo
A plataforma passou por uma evolução estrita focada na preparação para escala (SaaS Multi-Tenant e Mensageria) mantendo 100% de compatibilidade com os fluxos de sucesso do sistema legado, primariamente respeitando o motor de WhatsApp ativo.

## Alterações Realizadas
- **Arquitetura Híbrida do WhatsApp:** O motor `whatsapp-engine.cjs` (Baileys) foi isolado em seu container de responsabilidade com middleware de proteção (`x-api-key`). Um cliente Frontend `WhatsAppService` foi acoplado para se conectar a ele com mecanismos de retentativa (Retry Exponencial).
- **Centralização do Publisher:** Remoção das lógicas esparsas para um `Publisher` único suportando abstrações.
- **Preparação Social (Stub):** Facebook e TikTok possuem classes arquitetadas e prontas para acionamento assim que App IDs existirem.
- **Analytics e Segurança:** ZodSchemas adotados na borda. `confidence_score` imerso no Scraper.

## Riscos Mitigados
- **Perda de Sessão do Baileys:** Nenhuma refatoração agressiva foi feita dentro do express router do baileys, a pasta persistente não corre perigo de reset. Apenas um middleware superficial de token foi exposto.
- **Locking de API:** A transição do agendamento engessado (Cron/REST loop) passou a preparar os alicerces do **Inngest**, permitindo execuções descentralizadas para IA e disparos massivos, evitando Vercel Timeouts.

## Próximos Passos
1. Substituir/injetar credenciais oficiais de Inngest no ambiente Vercel.
2. Adicionar as rotas de webhook das redes de afiliados reais no novo `analytics_service`.
