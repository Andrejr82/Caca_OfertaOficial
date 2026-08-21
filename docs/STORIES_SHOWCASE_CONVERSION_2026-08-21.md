# Stories + vitrine + conversão

Data: 2026-08-21

## Objetivo

Fechar o ciclo comercial do Story publicado: arte com CTA coerente, publicação manual direta e oferta automaticamente disponível na vitrine usada pelo link da bio.

## Mudanças

- O Story deixa de exibir o CTA morto `VER OFERTA 👇`.
- Instagram usa `OFERTA NO LINK DA BIO`.
- Facebook usa `OFERTA NO LINK DO PERFIL`.
- A arte principal usa `ACHADINHO DO DIA` e hierarquia comercial com desconto, `De`, `Por` e economia em linhas separadas quando houver fatos válidos.
- Benefícios não comprovados não são inventados apenas para preencher a arte.
- O `/bio` passa a considerar também recibos de Stories publicados no Instagram, sem alterar o status do draft original de feed.
- Se a mesma oferta já estiver na vitrine por uma publicação de feed, ela é deduplicada e a ocorrência mais recente vence.
- A publicação de Story continua exigindo link rastreado e continua sendo somente por clique explícito.

## Vitrine

A fonte tradicional da vitrine continua sendo posts Instagram com status `published`. Para Stories, o sistema usa os recibos `stories.publication.receipt.instagram.*` gravados apenas depois do retorno de sucesso da Meta. O post associado é então incluído na vitrine com o horário real do recibo.

Isso evita marcar um draft de feed como publicado quando somente o Story foi enviado.

## Conversão

O CTA do Story agora direciona verbalmente para o link estático do perfil, enquanto a oferta selecionada entra automaticamente na página `/bio`. Assim, não é necessário editar o Story nem colar um link a cada publicação.

A conta do Instagram ainda precisa ter o endereço público da vitrine configurado no link da bio/perfil. Essa configuração é estática e não muda a cada produto.

## Fora de escopo

- repaginação completa do Instagram;
- Reels;
- anúncios pagos/Stories Ads;
- sticker de link via API, não suportado pelo fluxo orgânico atual;
- auto-publicação.
