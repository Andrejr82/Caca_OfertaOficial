# Instagram Policy Guard

## Objetivo

Reduzir risco de bloqueios e punições no Instagram impedindo, antes da publicação oficial, conteúdo comercial/afiliado com sinais claros de categorias proibidas ou sensíveis pelas políticas da Meta.

## Ponto de aplicação

O guard roda no fluxo de aprovação oficial do Instagram, antes das transições de seleção/aprovação e antes de qualquer chamada de publicação à Graph API.

## Comportamento fail-closed

A publicação é rejeitada quando:

- o contexto necessário para avaliação não pode ser carregado do Supabase;
- não existe nenhum contexto textual utilizável;
- produto, categoria, notas ou legenda acionam uma regra preventiva.

A oferta não é automaticamente marcada como `rejected`: o bloqueio vale para a tentativa de publicação no Instagram e preserva a possibilidade de revisão humana.

## Regras preventivas atuais

- armas, munições e explosivos;
- drogas recreativas, tabaco, nicotina e vape;
- bebidas alcoólicas;
- produtos e serviços adultos/sexuais;
- apostas, cassino e jogos de azar;
- medicamentos/fármacos e alegações sensíveis de emagrecimento;
- animais vivos e comércio de vida selvagem;
- conteúdo político/governamental incompatível com branded content comum;
- falsificações, pirataria e violações explícitas de propriedade intelectual.

## Auditoria operacional

Todo bloqueio emite log estruturado com o evento `instagram.policy.blocked`, contendo:

- `offerId`;
- `postId`;
- `tenantId`;
- `rule`;
- `code`;
- `reason`.

O código retornado é `INSTAGRAM_POLICY_BLOCKED` para regra acionada ou `INSTAGRAM_POLICY_INPUT_INVALID` quando o contexto não pode ser validado.

## Referências de política

As regras devem acompanhar as políticas vigentes da Meta para branded content, Community Standards, regulated goods e propriedade intelectual. O conjunto é deliberadamente conservador para publicação afiliada.
