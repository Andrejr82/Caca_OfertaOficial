# Hotfix Instagram Stories Comercial — 2026-08-20

## Contexto

O smoke test em produção após os PRs #156 e #157 confirmou que o handoff Stories V4 estava funcional, porém as artes 1080x1920 estavam visualmente fracas para conversão: excesso de espaço vazio, ausência da imagem do produto, preço sem hierarquia comercial e aparência de mock interno.

## Escopo deste hotfix

Alterar somente o gerador `src/app/api/images/instagram-story/route.ts` para produzir criativos comerciais usando fatos persistidos da oferta.

### Tela 1
- imagem real do produto quando houver URL HTTPS válida;
- nome compacto do produto;
- preço atual em destaque;
- preço anterior e percentual de desconto somente quando matematicamente válidos.

### Tela 2
- imagem real do produto;
- economia em R$ e percentual de desconto quando houver preço anterior válido;
- fallback para preço atual sem inventar economia quando não houver comparação válida.

### Tela 3
- imagem real do produto;
- preço atual em grande destaque;
- economia quando verificada;
- CTA textual para tocar no sticker;
- área visual reservada ao sticker de link, sem desenhar botão falso clicável.

## Guardrails

- sem urgência baseada em estoque ou prazo não verificados;
- sem desconto/economia inventados;
- sem imagem HTTP insegura;
- sem auto-publicação de Stories;
- Reels permanece fora de escopo;
- sem Radar;
- sem Oracle;
- sem alteração de schema Supabase;
- sem deploy manual.

## Testes adicionados

`src/tests/app/api/images/instagram-story-commercial-art.test.ts`

Cobertura:
- imagem real HTTPS;
- preço atual;
- preço anterior;
- economia calculada;
- desconto calculado;
- ausência de desconto/economia quando não verificáveis;
- rejeição de imagem não HTTPS.

## Critério de aprovação

Antes de mergear, validar:
1. targeted tests verdes;
2. `git diff --check` verde;
3. nenhum erro de typecheck exclusivo do branch;
4. preview da Vercel verde;
5. smoke visual com oferta real antes de qualquer publicação.
