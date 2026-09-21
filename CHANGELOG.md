# Changelog

## [2026-09-21] — Consolidação Estrutural, Auditoria VPS Oracle e Higienização Vercel
- **Consolidação Estrutural de `src/`**: Unificação dos módulos centrais em `src/core/`, `src/lib/`, `src/types/` e `src/tests/`. Eliminação de duplicações, consolidação dos motores de inteligência e ranking, e arquivamento seguro de material legado.
- **Suíte de Testes Automatizados 100% Verde**: 2.522 testes automatizados unificados (2.121 Vitest + 401 CommonJS) executando com aprovação total.
- **Auditoria e Otimização da Oracle Cloud VPS (`193.122.242.178`)**: Liberação de ~1GB de espaço em disco, compactação e arquivamento seguro em `/home/ubuntu/archive_vps_legacy_20260921.tar.gz`, mantendo todos os 6 processos PM2 operacionais (`oracle-api :3002`, `whatsapp-bot :3001`, `oracle-scraper`, `oracle-trends-radar`, `video-worker`, `authorized-reel-verifier`).
- **Auditoria Forense e Higienização da Vercel (`caca-oferta-oficial`)**: Exclusão via API de 25 variáveis de ambiente obsoletas e duplicadas (Cloudinary, Magalu, Firecrawl, Inngest, chaves `_2`), remoção de `typescript.ignoreBuildErrors: true` no `next.config.ts`, otimização do `ignoreCommand` no `vercel.json` e deploy oficial em produção `READY` com validação de tipos TypeScript estrita.
- **Alinhamento Git Global**: Sincronização unificada do repositório local, GitHub (`origin/main`), Oracle Cloud VPS e Vercel Production.

## [2026-07-28]
- Discovery: filtragem de monetização antes da fila, verificação de links e prevenção de persistência inválida.
- Tracking e copys: links persistidos por canal, UUID completo, isolamento de prefixos e prevenção de links duplicados na copy.
- Formatação comercial: desconto percentual e blocos de preço mais consistentes.
- Imagens sociais: normalização de URLs de imagem de origem para previews e publicação.
- Publicação Expressa: persistência de links afiliados, contratos de extração por marketplace e redirecionamento para destinos monetizados.
- Operação: atualização do manifesto e dos scripts Oracle somente por release verificado; nenhum segredo ou dado histórico foi incluído na documentação.

## [Unreleased]
- Fase 4 (Discovery Intelligence): Consolidação definitiva da Discovery Intelligence na Release 4.0. Implementação de novas regras focadas (Anti-Lixo e Price Floor) no Marketplace da Shopee.
- Relatórios Inteligentes (Sprint 00.7.1): Implementação de report de métricas reais eliminando placeholders/mocks.
- Sprint 08 - Legacy Cleanup (V3): Limpeza completa de código morto, removendo funções _DEPRECATED (ex: generateOfferAnalysis_DEPRECATED) de ai-processor.cjs, excluindo temp-runner.cjs e testes órfãos, e consolidando a arquitetura baseada em Engines.
- End-to-End Acceptance Test (Sprint 06): NO-GO devido a 15 regressões críticas nos testes e quebra no E2E pipeline.
- Validação Comercial Sprint 03 executada: O Commercial Ranking demonstrou clara superioridade e alinhamento com os objetivos de GMV e foco da IA, reduzindo itens low-ticket.

- Ativação Comercial Sprint 04 executada: Commercial Policy torna-se a Official Policy (ACTIVE). Antiga política arquivada como Historical Policy (ARCHIVED).

## [4.0.0] - 2026-07-04
- Fase 4: Discovery Intelligence Finalizada.
- Melhoria massiva na qualidade de curadoria via Oracle Scraper.

## [3.0.0] - 2026-07-04
- Oficialização da Release 3.0: Fase 3 Consolidada.
- Baseline arquitetural definida sem Shadow Mode.
- Nova Política Comercial oficialmente promovida.


## [3.1.0] - 2026-07-04
- Sprint 09 - Release Readiness: Auditoria final concluída. Build e testes validados. Arquivos temporários limpos. Preparado para a Release Oficial.
