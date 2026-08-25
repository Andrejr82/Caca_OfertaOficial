# Segurança

<!-- docs-status: current -->
<!-- verified-against: e16ce0d1ae525b3f0f9fd95e6554cc62b5c6a0d7 -->
<!-- verified-on: 2026-08-25 -->

## Fronteiras de confiança

- Navegador usa somente credenciais públicas e sessão autenticada.
- Operações administrativas usam clientes server-side e nunca expõem a service-role key.
- Oracle↔Vercel e workers exigem segredo de serviço e validação de payload.
- Webhooks validam autenticidade antes de alterar estado.

## Banco e Storage

- RLS deve permanecer habilitado e coberto por políticas explícitas.
- Migrations precisam preservar constraints de estado, identidade e idempotência.
- Nunca tornar sessões, logs, arquivos temporários ou credenciais publicamente acessíveis.

## Publicação

- Discovery e geração de draft não podem publicar implicitamente.
- Rotas exigem entidades oficiais e conteúdo de `posts.content`.
- Ofertas `rejected` são bloqueadas antes da publicação social.
- Guardas históricas evitam republicação por ID ou identidade comercial equivalente.
- Preço, desconto, frete, rating, cupom e link precisam de evidência do marketplace.
- `/api/instagram/publish` executa Safety + `Instagram Policy Guard` antes de qualquer chamada de mídia à Meta.

## Segredos e logs

- Valores reais ficam fora do Git; `.env.example` contém apenas nomes seguros.
- Sanitizar bearer tokens, cookies, payloads pessoais, URLs assinadas e service-role keys.
- Nunca registrar tokens, chaves privadas, conteúdo de `.env` ou material de sessão em documentação.
- Executar `npm run security:check` antes do merge e do deploy.

## Segurança do Radar dedicado

- Na auditoria Oracle de 25/08/2026, `TRENDS_RADAR_DEDICATED_RUNTIME=true` estava ativo no processo PM2 `oracle-trends-radar`.
- `TREND_EXECUTIVE_MODE=off` permanece o estado seguro auditado.
- O `oracle-scraper` não consome solicitações Radar no ciclo editorial.
- O worker dedicado reutiliza o engine existente e usa lock local `/tmp/caca-oferta-trends-radar.lock`.
- O lock é proteção de host, não garantia distribuída entre múltiplos hosts.
- Qualquer mudança de autoridade deve preservar exatamente um consumidor do Radar.

## Resposta a incidente

Bloquear publicação, preservar correlation IDs/logs, rotacionar segredos afetados e só reativar após smoke tests controlados. Não criar bypass de produção para contornar guardas de segurança.
