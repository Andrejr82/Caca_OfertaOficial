# Configuração

<!-- docs-status: current -->
<!-- verified-against: 3cf179c -->
<!-- verified-on: 2026-08-11 -->

## Princípios

- `.env.example` é o inventário seguro; valores reais ficam em `.env.local`, Vercel, Oracle/PM2 ou secret store.
- Flags novas entram desligadas ou fail-closed quando controlam descoberta, persistência, IA ou publicação.
- Arquivos de overlay Oracle aceitam apenas chaves permitidas e devem ser validados antes de reiniciar processos.
- URLs públicas, service-role keys e credenciais de canais não podem aparecer em logs ou documentação.

## Grupos de configuração

| Grupo | Uso |
|---|---|
| Supabase | URL, chaves pública/server-side, tabelas, RPCs e Storage |
| Aplicação | URLs pública/interna, autenticação e ambiente Next.js |
| Official AI | provider, modelo, limites e chaves Groq/Cerebras |
| Oracle | URL remota, chave da API, scheduler, limites e overlay |
| Marketplaces | credenciais, fontes, paginação e flags de admissão |
| Publicação | Telegram, Meta/Instagram/Facebook e WhatsApp |
| Vídeo | worker, TTS, FFmpeg, Storage, heartbeat e limites |

## Shopee OpenAPI V1

O runtime possui controles separados para fonte, persistência, geração de drafts e publicação. A ativação deve ocorrer por janela controlada, com overlay validado, logs observados e publicação bloqueada até aprovação explícita. Não deduza ativação somente pela presença da variável em `.env.example`.

## Validação

```bash
npm run typecheck
npm test
npm run build
npm run security:check
```

Depois do deploy, valide `/api/health`, `/api/readiness`, logs Oracle/PM2 e um smoke test read-only das integrações necessárias.

## Trend Executive

`TREND_EXECUTIVE_MODE` aceita o contrato `off | shadow | active`, porém o runtime e o overlay versionado permanecem fail-closed: `off` é o padrão e `active` está bloqueado até implementação/autorização futura. `shadow` nunca substitui a autoridade do cenário legado. Não altere esta flag em produção sem cumprir o readiness gate e o plano de rollback documentado.
