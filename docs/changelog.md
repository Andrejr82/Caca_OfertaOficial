# Histórico de Mudanças (Changelog)

Todas as atualizações mais vitais do **Caça Oferta Oficial** estão listadas aqui. O versionamento da documentação acompanha as tags principais de release da branch `main`.

## [0.1.0] - Geração Atual (Estado Validado)
**Data de Documentação da Auditoria Principal**

### Adições:
- Implementação extensiva e mapeada do `Inngest` para processos assíncronos (evitando timeout na Vercel).
- Conclusão do módulo de API do Instagram (agora implementado nativamente nos endpoints `/api/instagram`).
- Refatoração dos cálculos de IA: Criação do pipeline de avaliações com tabelas `ai_copy_logs`.
- Geração inteligente via Groq Llama-3 garantindo baixa latência.
- Extensão Scraper Chrome validada, chamando os importadores diretos.

### Alterações:
- O painel de Autenticação passou por upgrades de pacotes, adotando a API moderna SSR do `@supabase/ssr`.
- Todo o envio de WhatsApp foi isolado num processo Daemon `whatsapp-engine.cjs` via `baileys` para estabilidade.
- Atualização em lote de todas as docs para representar fidedignamente o código e não *desejos* passados.

## [MVP] - Legado
### Adições Iniciais:
- Tabela `offers` simples com inputs diretos.
- Gerador de textos simples com Prompt estático.
- Conexão inicial com o bot do Telegram para alertas unidirecionais rápidos.
