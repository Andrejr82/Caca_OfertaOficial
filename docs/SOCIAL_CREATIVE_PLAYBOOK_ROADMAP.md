# Playbook Oficial de Criativos de Venda por Nicho

<!-- docs-status: current -->
<!-- verified-against: 648a2db637e0fe60efca92cc336a5656b5ccc9f1 -->
<!-- verified-on: 2026-08-25 -->

## Objetivo

Transformar ofertas de marketplace em campanhas de venda, evitando o comportamento de catálogo seco. Cada produto deve sair com ângulo de venda, formato criativo e copy adequados ao canal.

## Direção aprovada para validação

### Camada compartilhada — Sales Video Creative Director
- `/reels` e **Vídeos de Ofertas** passam a compartilhar uma camada de direção criativa por **tipo de produto**, não apenas por nicho.
- A direção escolhe ambiente, desejo, ação inicial, ação principal, prova visual, câmera, iluminação, regra anti-apresentação e restrições de claims.
- Arquétipos atuais: calçado, moda, eletroportátil de cozinha, panela/utensílio, beleza, pet, ferramenta, costura, eletrônicos, organização/limpeza e fallback geral.
- Regra principal: **a ação começa no primeiro segundo**. Não iniciar com produto parado, packshot, hero shot ou avatar apresentando oferta.
- O produto deve ser desejado pela **situação de uso**, não apenas exibido.
- A imagem anexada continua sendo a autoridade visual do produto.
- A estrutura segue a orientação oficial do Google Vids de detalhar assunto/ação, câmera, iluminação, diálogo/voz, som e tom e, ao trabalhar com imagem, priorizar instruções claras de movimento.

### Reels / Google Vids
- Vídeos verticais de até 20s.
- Produção em 2 cenas independentes de 10s.
- A aba `/reels` deve exibir dois prompts completos, prontos para copiar/usar no Google Vids.
- Cada prompt inclui internamente: duração, 9:16, cenário, produto, ação, câmera, iluminação, avatar hiper-realista, fala em pt-BR, texto na tela, continuidade e restrições comerciais.
- O avatar deve estar integrado ao uso real; não deve ficar parado segurando o produto ou atuando como apresentador.
- A fala do avatar fica incorporada ao próprio prompt.
- O texto final deve combinar oferta + CTA proporcional, como `R$ X • Toque no link`, sem dominar a tela.
- O painel permite **baixar a imagem do produto** usando o mesmo proxy de **Vídeos de Ofertas**.
- A Cena 2 deve preservar avatar, roupa, cenário, luz, produto e direção do movimento da Cena 1.
- Não inventar funções, acessórios, descontos, cupons, selos, urgência ou preços.
- `/reels` não duplica upload, recorte ou processamento de vídeo.
- Depois da criação no Google Vids, o vídeo final continua sendo importado em **Vídeos de Ofertas**.

### Vídeos de Ofertas
- O prompt de usabilidade deixa de usar sequência genérica `apresentação → hero shot`.
- Nova sequência: **uso já começou → gesto principal → prova visual → continuidade → fechamento em contexto**.
- Continua sem avatar ofertando, sem narração e sem texto promocional, pois esta aba gera o material visual de usabilidade.
- O objetivo é que, mesmo sem áudio, a pessoa entenda como o produto entra na rotina e por que vale avaliar a oferta.

### Facebook
- Evitar texto de catálogo.
- Priorizar conversa, rotina, dor/desejo e contexto de uso.
- Para grupos, usar linguagem natural e pergunta/observação que convide interação.
- Exemplo: `Alguém aqui usa sanduicheira todo dia? Achei essa Mondial por R$89,30...`.

### Instagram / Reels
- Criativo principal será o vídeo produzido no Google Vids.
- Prioridade para gancho forte nos primeiros segundos, demonstração e benefício visual.

### WhatsApp
- Evitar fundo branco como padrão principal.
- Criar imagem contextual por nicho, mantendo o produto em destaque.
- Cenários: Casa/Cozinha → cozinha; Beleza → penteadeira/banheiro; Moda → lifestyle; Pet → ambiente doméstico; Ferramentas → oficina/garagem.
- Imagem contextual exige revisão visual antes de publicação.

## Regra de avanço

As tasks são sequenciais e bloqueadas por aprovação explícita do usuário.

- Não iniciar a Task 2 antes da aprovação da Task 1.
- Não iniciar a Task 3 antes da aprovação da Task 2.
- Não fazer deploy de produção antes de testes eficazes e aprovação da task em validação.
- Mudanças permanecem em branch isolada até aprovação.
- Motores de busca não fazem parte deste escopo.
- Oracle não deve ser alterada diretamente. Caso uma task futura exija Oracle, preparar instrução separada para execução via Gemini/IDE.

## Tasks

### Task 1 — `/reels`: prompts em 2 cenas
**Status:** testes focados aprovados; aguardando aprovação manual do usuário.

**Objetivo:** adaptar `/reels` para vídeo de 20s em 2 cenas de 10s e elevar a qualidade dos prompts compartilhando direção criativa com Vídeos de Ofertas.

Entregáveis:
- Prompt Cena 1 completo.
- Prompt Cena 2 completo.
- Fala do avatar incorporada.
- Texto na tela incorporado.
- **Baixar imagem** do produto.
- CTA de clique proporcional.
- Direção criativa por arquétipo de produto.
- Ação real desde o primeiro segundo.
- Sem apresentação estática do produto.
- Sem upload/recorte novo em `/reels`.

Teste de aceitação:
- Sanduicheira Mondial real de Casa/Cozinha.
- Tênis real do piloto para validar calçado em movimento.
- Casos adicionais de eletrônico, moda, pet e costura.
- Confirmar 2 cenas de 10s, 9:16, continuidade, fidelidade e CTA.
- Confirmar ausência de apresentação estática e claims inventados.
- Confirmar que Vídeos de Ofertas também usa direção de uso real.
- Nenhum deploy de produção antes da aprovação.

Validação técnica concluída:
- Vitest focado `/reels` + `Vídeos de Ofertas`: **9/9 PASS**;
- typecheck focado: **PASS**;
- ESLint focado: **PASS**;
- workflow temporário removido após o gate.

### Task 2 — Facebook: copy de conversa e desejo
**Status:** bloqueada pela aprovação da Task 1.

**Objetivo:** gerar copy própria para Feed e grupos, sem formato de catálogo.

Teste de aceitação:
- 1 produto real.
- Comparar copy atual vs. copy do playbook.
- Aprovação manual antes de avançar.

### Task 3 — Instagram/Reels: publicação orientada a vídeo
**Status:** bloqueada.

**Objetivo:** usar o vídeo aprovado da Task 1 como criativo principal do Instagram/Reels.

Teste de aceitação:
- Validar formato 9:16, capa, legenda e CTA.
- Aprovação manual antes de avançar.

### Task 4 — WhatsApp: imagem contextual por nicho
**Status:** bloqueada.

**Objetivo:** substituir a apresentação de fundo branco por cenário coerente com o nicho quando o produto permitir.

Teste de aceitação:
- Gerar 1 criativo Casa/Cozinha com cenário de cozinha.
- Conferir fidelidade do produto, leitura do preço e ausência de artefatos.
- Aprovação manual antes de avançar.

### Task 5 — Playbook por nicho
**Status:** bloqueada.

**Objetivo:** consolidar regras de ângulo, criativo, roteiro e CTA para os 7 nichos.

Teste de aceitação:
- Validar pelo menos 1 produto por nicho antes de tornar a regra padrão.

## Critério de sucesso

A métrica final é venda atribuída. Views, retenção, cliques e CTR são métricas de diagnóstico para melhorar criativo e distribuição, não o objetivo final.
