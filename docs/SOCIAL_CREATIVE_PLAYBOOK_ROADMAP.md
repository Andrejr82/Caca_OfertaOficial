# Playbook Oficial de Criativos de Venda por Nicho

<!-- docs-status: current -->
<!-- verified-against: 648a2db637e0fe60efca92cc336a5656b5ccc9f1 -->
<!-- verified-on: 2026-08-25 -->

## Objetivo

Transformar ofertas de marketplace em campanhas de venda, evitando o comportamento de catálogo seco. Cada produto deve sair com ângulo de venda, formato criativo e copy adequados ao canal.

## Direção aprovada para validação

### Reels / Google Vids
- Vídeos verticais de até 20s.
- Produção em 2 cenas independentes de 10s.
- Cada cena terá prompt próprio, imagem de apoio, fala do avatar hiper-realista, texto na tela e objetivo.
- A aba `/reels` deve exibir os dois prompts de forma operacional para copiar/usar no Google Vids.
- Continuidade perfeita entre cenas não é garantida; o sistema deve facilitar consistência de avatar, cenário, produto e narrativa.

### Facebook
- Evitar texto de catálogo.
- Priorizar conversa, rotina, dor/desejo e contexto de uso.
- Para grupos, usar linguagem natural e pergunta/observação que convide interação.
- Exemplo de referência: `Alguém aqui usa sanduicheira todo dia? Achei essa Mondial por R$89,30...`.

### Instagram / Reels
- Criativo principal será o vídeo produzido no Google Vids.
- Prioridade para gancho forte nos primeiros segundos, demonstração e benefício visual.

### WhatsApp
- Evitar fundo branco como padrão principal.
- Criar imagem contextual por nicho, mantendo o produto em destaque.
- Exemplos de cenário:
  - Casa/Cozinha: cozinha realista.
  - Beleza: penteadeira/banheiro elegante.
  - Moda: ambiente lifestyle.
  - Pet: ambiente doméstico com contexto pet.
  - Ferramentas: oficina/garagem organizada.
- Imagem contextual exige revisão visual; não deve ser liberada automaticamente quando houver artefatos, distorção ou perda de fidelidade do produto.

## Regra de avanço

As tasks são sequenciais e bloqueadas por aprovação explícita do usuário.

- Não iniciar a Task 2 antes da aprovação da Task 1.
- Não iniciar a Task 3 antes da aprovação da Task 2.
- Não fazer deploy antes de testes eficazes e aprovação da task em validação.
- Mudanças permanecem em branch isolada até aprovação.
- Motores de busca não fazem parte deste escopo.
- Oracle não deve ser alterada diretamente. Caso uma task futura exija Oracle, preparar instrução separada para execução via Gemini/IDE.

## Tasks

### Task 1 — `/reels`: prompts em 2 cenas
**Objetivo:** adaptar a aba `/reels` para um vídeo de 20s dividido em 2 cenas de 10s.

Entregáveis:
- Prompt Cena 1.
- Prompt Cena 2.
- Fala do avatar para cada cena.
- Texto na tela por cena.
- Imagem de apoio/referência por cena.
- CTA final.
- Prévia simples dos dois blocos no painel.

Teste de aceitação:
- Usar 1 produto real.
- Confirmar que os dois prompts podem ser usados separadamente no Google Vids e formam uma narrativa contínua de 20s.
- Nenhum deploy antes da aprovação do resultado.

### Task 2 — Facebook: copy de conversa e desejo
**Objetivo:** gerar copy própria para Feed e grupos, sem formato de catálogo.

Teste de aceitação:
- 1 produto real.
- Comparar copy atual vs. copy do playbook.
- Aprovação manual antes de avançar.

### Task 3 — Instagram/Reels: publicação orientada a vídeo
**Objetivo:** usar o vídeo aprovado da Task 1 como criativo principal do Instagram/Reels.

Teste de aceitação:
- Validar formato 9:16, capa, legenda e CTA.
- Aprovação manual antes de avançar.

### Task 4 — WhatsApp: imagem contextual por nicho
**Objetivo:** substituir a apresentação de fundo branco por cenário coerente com o nicho quando o produto permitir.

Teste de aceitação:
- Gerar 1 criativo Casa/Cozinha com cenário de cozinha.
- Conferir fidelidade do produto, leitura do preço e ausência de artefatos.
- Aprovação manual antes de avançar.

### Task 5 — Playbook por nicho
**Objetivo:** consolidar regras de ângulo, criativo, roteiro e CTA para os 7 nichos.

Teste de aceitação:
- Validar pelo menos 1 produto por nicho antes de tornar a regra padrão.

## Critério de sucesso

A métrica final é venda atribuída. Views, retenção, cliques e CTR são métricas de diagnóstico para melhorar o criativo e a distribuição, não o objetivo final.
