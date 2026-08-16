# Segurança

<!-- docs-status: current -->
<!-- verified-against: 2cfa11f -->
<!-- verified-on: 2026-08-16 -->

## Fronteiras de confiança

- Navegador usa somente credenciais públicas e sessão autenticada.
- Operações administrativas usam clientes server-side e nunca expõem a service-role key.
- Oracle↔Vercel e workers exigem segredo de serviço e validação de payload.
- Webhooks validam autenticidade antes de alterar estado.

## Banco e Storage

- RLS deve permanecer habilitado e coberto por políticas explícitas.
- Migrations precisam preservar constraints de estado, identidade e idempotência.
- Uploads Shein/vídeo devem produzir URLs públicas somente nos buckets destinados a conteúdo público.
- Nunca tornar sessões, logs, arquivos temporários ou credenciais publicamente acessíveis.

## Publicação

- Discovery e geração de draft não podem publicar implicitamente.
- Rotas exigem `postId`/`offerId`, aprovação e conteúdo oficial em `posts.content`.
- Guardas históricas evitam republicação por ID ou identidade comercial equivalente.
- Preço, desconto, frete, rating, cupom e link precisam de evidência do marketplace.

## Segredos e logs

- Valores reais ficam fora do Git; `.env.example` contém apenas nomes seguros.
- Sanitizar bearer tokens, cookies, payloads pessoais, URLs assinadas e service-role keys.
- Executar `npm run security:check` antes do merge e do deploy.

## Resposta a incidente

Bloquear publicação, preservar correlation IDs/logs, rotacionar segredos afetados, avaliar dados persistidos e só reativar após smoke tests controlados.

## Segurança do Trend Executive

- Evidência direta e inferência permanecem separadas; fato desconhecido não é sintetizado.
- Fonte degradada, não confiável ou com drift material é bloqueada para novas contribuições até revisão.
- `TREND_EXECUTIVE_MODE=active` permanece inacessível no runtime atual.
- Shadow não publica, não altera autoridade e não aplica pesos automaticamente.
- Feedback de experimentos e sinais internos só usam venda/conversão quando a atribuição é explicitamente confiável.

## Segurança do runtime dedicado do Radar

- `TRENDS_RADAR_DEDICATED_RUNTIME` é fail-closed e permanece `false` por padrão.
- O processo dedicado reutiliza o engine existente e não possui caminho de publicação, criação de posts ou ofertas durante a geração do snapshot.
- Um lock de processo no host Oracle serializa execuções do worker dedicado; ele não deve ser usado como garantia distribuída entre múltiplos hosts.
- A ativação deve manter apenas uma autoridade de consumo: com a flag habilitada, o consumidor legado do `oracle-scraper` se abstém e o worker dedicado assume o Radar.
