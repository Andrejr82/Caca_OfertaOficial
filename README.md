# Caça Oferta Oficial

<!-- docs-status: current -->
<!-- verified-against: e16ce0d1ae525b3f0f9fd95e6554cc62b5c6a0d7 -->
<!-- verified-on: 2026-08-25 -->

Aplicação Next.js para descoberta, curadoria, geração de conteúdo com IA e publicação de ofertas em canais configurados. O estado das ofertas, posts, links e registros operacionais é mantido no Supabase.

O runtime operacional atual está descrito em [docs/CURRENT_SYSTEM_STATUS.md](docs/CURRENT_SYSTEM_STATUS.md). A hierarquia documental está em [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md). Os documentos PMAV5 são registros históricos e contratuais; não substituem a verificação do código e do manifesto de release.

## Arquitetura atual

A arquitetura canônica está em [docs/architecture-current.md](docs/architecture-current.md). A documentação oficial, organizada por assunto, está em [docs/official.md](docs/official.md).

```mermaid
flowchart LR
  A["Shopee / Mercado Livre / Amazon"] --> B["Oracle Worker\nDiscovery-Only"]
  B --> C[("Supabase")]
  B --> D["Official AI\n/api/ai/generate"]
  C --> E["Painel Next.js"]
  E --> F["Curadoria e drafts"]
  F --> G["Telegram / Instagram / WhatsApp / Facebook"]
```

Fluxo principal:

1. O Oracle Worker descobre candidatos nos marketplaces.
2. Os candidatos são persistidos no Supabase para revisão manual.
3. A Official AI gera drafts de copy e links rastreáveis.
4. O painel permite curadoria, aprovação e rejeição.
5. As publicações aprovadas são enviadas pelos transportes oficiais configurados.

O Oracle agenda Discovery em sete horários canônicos (`06:00`, `08:00`, `09:00`, `11:00`, `12:00`, `14:00` e `18:00`, `America/Sao_Paulo`) para os sete nichos ativos: Casa/Cozinha/Organização, Ferramentas, Informática, Beleza, Moda, Pet e Eletrodomésticos. Cupons permanece `manual_only` às 22h e não participa do cron de Discovery.

O ciclo Discovery-Only materializa candidatos de Shopee, Mercado Livre e Amazon; Shein, Magalu e Netshoes permanecem capacidades separadas até homologação própria. A Publicação Expressa é um fluxo independente de ingestão de links, com validação de marketplace e monetização antes da geração de copy.

## Proteções atuais de publicação social

- Ofertas em estado `rejected` não podem ser publicadas pelos fluxos sociais oficiais.
- Instagram publica Feed e Reels com identificação de parceria paga para conteúdo afiliado.
- O Instagram aplica validação de legenda, cota móvel de 24 horas, duplicidade de legenda/vídeo e validações conservadoras de mídia.
- O `Instagram Policy Guard` executa fail-closed antes da publicação e bloqueia categorias sensíveis/proibidas, registrando `instagram.policy.blocked` com regra e motivo.
- Facebook mantém o link afiliado no primeiro comentário, conforme o fluxo atual.
- WhatsApp mantém o Top30 editorial separado da Publicação Expressa; drafts ativos do canal não desaparecem apenas porque a oferta global foi aprovada em outra rede.

## Estrutura do repositório

- `src/app/`: páginas do painel e rotas da API Next.js.
- `src/components/`: componentes visuais e de layout.
- `src/core/`: regras de domínio, IA, estado, publicação e observabilidade.
- `src/lib/`: adaptadores, integrações, ambiente e serviços auxiliares.
- `src/tests/`: testes automatizados Vitest.
- `scripts/`: workers Oracle, WhatsApp, publicação, vídeo e utilitários operacionais.
- `supabase/`: schema e migrations do banco.
- `apps/oracle-capacity-hunter/`: monitoramento operacional do ambiente Oracle.
- `src/remotion/`: composições e templates de vídeos promocionais.
- `public/`: assets estáticos usados pelo painel e pelo Remotion.
- `docs/`: documentação atual, contratos, PMAV5, operação e históricos.
- `docs/archive/`: documentação legada e registros históricos; não é fonte de verdade do runtime.

## Documentação principal

- [Arquitetura atual](docs/architecture-current.md)
- [Documentação oficial](docs/official.md)
- [Instalação](docs/installation.md)
- [Ambiente e variáveis](docs/ambiente.md)
- [Configuração](docs/configuration.md)
- [APIs](docs/api.md)
- [Banco de dados](docs/banco.md)
- [Deploy](docs/deployment.md)
- [Fluxos](docs/fluxos.md)
- [Integrações](docs/integracoes.md)
- [Oracle Cloud](docs/oracle.md)
- [Runbook Oracle](docs/oracle-scripts-runbook.md)
- [Scripts](docs/scripts.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Segurança](docs/SECURITY.md)
- [Governança da documentação](docs/DOCUMENTATION_GOVERNANCE.md)

## Desenvolvimento local

Requer Node.js 20 ou superior. Configure as variáveis conforme [docs/ambiente.md](docs/ambiente.md) e mantenha os segredos apenas no `.env.local`.

```bash
npm install
npm run dev
```

Comandos de validação:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run security:check
npm run docs:audit
npm run verify
```

## Serviços e scripts principais

- `scripts/oracle-worker-discovery-only.cjs`: worker oficial de descoberta.
- `scripts/oracle-scraper.cjs`: scheduler e integração do ciclo Oracle.
- `scripts/oracle-api.cjs`: gateway técnico Oracle na porta `3002`.
- `scripts/whatsapp-engine.cjs`: motor Baileys na porta `3001`.
- `scripts/oracle-trends-radar-worker.cjs`: worker dedicado do Radar, separado do ciclo editorial.
- `scripts/video-worker.py` e `scripts/video_worker_runtime.py`: processamento de vídeo quando configurado.

Auditoria read-only da VPS em 25/08/2026 confirmou `oracle-scraper`, `oracle-api`, `whatsapp-bot`, `oracle-trends-radar`, `authorized-reel-verifier` e `video-worker` online no PM2; `TRENDS_RADAR_DEDICATED_RUNTIME=true`; `TREND_EXECUTIVE_MODE=off`; scheduler único com `noOverlap`; e Capacity Hunter passivo a cada 30 minutos. O checkout da VPS auditado estava em `febe66abb28bd47c738d925befc50ad365c59371`, portanto o SHA implantado deve sempre ser comparado com a `main` antes de qualquer operação.

## IA Executiva de Tendências

O runtime inclui o Radar Executivo de Tendências em `/trends`, com evidência direta, snapshots auditáveis, Score V2, Top 3/Top 20, performance interna e contratos de integração Radar → Oracle. `TREND_EXECUTIVE_MODE=off` permanece o estado seguro. O worker dedicado do Radar está operacional na Oracle com `TRENDS_RADAR_DEDICATED_RUNTIME=true`; o `oracle-scraper` não consome solicitações do Radar no ciclo editorial.
