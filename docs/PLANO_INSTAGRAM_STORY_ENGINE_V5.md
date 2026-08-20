# Story Engine V5 — Caça Ofertas Oficial

## Objetivo
Substituir o renderer atual de Stories por uma arquitetura comercial determinística, orientada a fatos reais da oferta e inspirada em linguagem nativa de achadinhos/social commerce.

## Princípios
- produto é o protagonista visual;
- primeira tela precisa funcionar sozinha;
- 1–3 telas conforme força comercial real, nunca por preenchimento;
- nenhuma urgência, prova, frete, desconto ou economia inventados;
- CTA único e curto;
- marca discreta;
- imagem ruim ou ausente não vira HERO visual;
- sem Reels e sem auto-publicação nesta fase;
- validar localmente antes de qualquer merge/deploy de produção.

## Famílias de template
- `DISCOUNT_HERO`: preço anterior válido + desconto/economia comercialmente relevantes.
- `PROOF_HERO`: prova verificável forte do marketplace (ex.: avaliação alta, bestseller/ranking, loja oficial/Mall, vendas quando estruturadas e válidas).
- `PRICE_HERO`: preço atual válido, sem desconto/prova forte suficiente para as famílias anteriores.

## Regras de frame count
- 1 frame: produto + preço, sem prova/benefício comercial adicional forte.
- 2 frames: existe exatamente um reforço comercial verificável (desconto/economia OU prova forte OU frete grátis confirmado).
- 3 frames: existem pelo menos dois reforços comerciais verificáveis e distintos.
- nunca criar tela vazia para completar 3.

## Tasks
### Task 1 — Classificador comercial e plano de frames
Criar contrato determinístico `StoryV5Plan` com template, título comercial curto, fatos derivados e número de frames. TDD obrigatório.

### Task 2 — Renderer V5 nativo
Criar novo renderer 1080x1920 independente do template V4 atual. Produto ocupa 50–65% da composição; preço e vantagem principal devem ser legíveis em menos de 1 segundo.

### Task 3 — Integração com endpoint/painel
Fazer `/api/images/instagram-story` consumir `StoryV5Plan`, renderizar apenas os frames existentes e ajustar o painel para mostrar 1–3 botões dinamicamente.

### Task 4 — QA visual local com ofertas reais
Validar ao menos um exemplo `DISCOUNT_HERO`, um `PRICE_HERO` e, se houver dados, um `PROOF_HERO`. Não mergear se qualquer arte tiver overflow, espaço morto excessivo ou aparência de dashboard.

### Task 5 — Guardrails e fechamento
Regressões de factualidade, ausência de urgência falsa, ausência de botão/sticker falso, `git diff --check`, testes direcionados, typecheck sem regressões além do baseline conhecido.

## Fora de escopo
Radar, Oracle, Supabase schema/migrations, Reels, automação de sticker e publicação automática.