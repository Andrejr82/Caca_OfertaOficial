# Segurança

<!-- docs-status: current -->
<!-- verified-against: bbc19859e630c0db15aeb162056cfb56673bba19 -->
<!-- verified-on: 2026-08-18 -->

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
- Ofertas `rejected` são bloqueadas antes da publicação social.
- Guardas históricas evitam republicação por ID ou identidade comercial equivalente.
- Preço, desconto, frete, rating, cupom e link precisam de evidência do marketplace.
- Instagram Feed e Reels usam disclosure de parceria paga no transporte atual para conteúdo afiliado.
- `/api/instagram/publish` executa Safety + `Instagram Policy Guard` antes da aprovação/publicação e antes de qualquer chamada de mídia à Meta.
- O Policy Guard opera fail-closed: contexto ausente ou categoria preventiva acionada bloqueiam o envio e geram evento `instagram.policy.blocked`.

## Segredos e logs

- Valores reais ficam fora do Git; `.env.example` contém apenas nomes seguros.
- Sanitizar bearer tokens, cookies, payloads pessoais, URLs assinadas e service-role keys.
- Logs do Policy Guard devem registrar regra/código/IDs operacionais, nunca tokens ou conteúdo secreto.
- Executar `npm run security:check` antes do merge e do deploy.

## Resposta a incidente

Bloquear publicação, preservar correlation IDs/logs, rotacionar segredos afetados, avaliar dados persistidos e só reativar após smoke tests controlados. Em falso positivo do Policy Guard, corrigir a regra e adicionar teste de regressão; não criar bypass de produção.

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
