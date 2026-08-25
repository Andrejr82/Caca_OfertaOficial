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
- A aba `/reels` deve exibir dois prompts completos, prontos para copiar/usar no Google Vids.
- Cada prompt deve incluir internamente: duração, formato 9:16, cenário, produto de referência, ação, avatar hiper-realista, fala exata em português do Brasil, sincronização labial, texto na tela e regras de segurança comercial.
- A fala do avatar não deve depender de um segundo bloco separado para funcionar no Google Vids.
- O painel deve permitir **baixar a imagem do produto**, reaproveitando o mesmo proxy usado em **Vídeos de Ofertas**.
- A mesma imagem de referência deve ser reutilizada nas duas gerações quando possível para reforçar continuidade.
- A Cena 2 deve declarar explicitamente que é continuação direta da Cena 1 e preservar avatar, rosto, cabelo, roupa, acessórios, iluminação, cenário, posição relativa do produto e linguagem de câmera.
- O produto deve manter marca, formato, cor, proporções e detalhes reconhecíveis da imagem de referência.
- Não inventar funções, acessórios, descontos, cupons, selos, urgência ou preços.
- `/reels` não deve duplicar upload, recorte ou processamento de vídeo.
- Depois da criação no Google Vids, o usuário continuará importando o vídeo final em **Vídeos de Ofertas**, preservando a estrutura existente de recorte e fluxo posterior.

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
- Não fazer deploy de produção antes de testes eficazes e aprovação da task em validação.
- Mudanças permanecem em branch isolada até aprovação.
- Motores de busca não fazem parte deste escopo.
- Oracle não deve ser alterada diretamente. Caso uma task futura exija Oracle, preparar instrução separada para execução via Gemini/IDE.

## Tasks

### Task 1 — `/reels`: prompts em 2 cenas
**Status:** testes focados aprovados; aguardando aprovação manual do usuário.

**Objetivo:** adaptar a aba `/reels` para um vídeo de 20s dividido em 2 cenas de 10s.

Entregáveis:
- Prompt Cena 1 completo.
- Prompt Cena 2 completo.
- Fala do avatar incorporada dentro de cada prompt.
- Texto na tela incorporado dentro de cada prompt.
- Botão **Baixar imagem** do produto, igual ao fluxo de Vídeos de Ofertas.
- Imagem de referência reutilizável nas duas cenas.
- CTA final.
- Sem upload/recorte novo em `/reels`; vídeo final permanece no fluxo de **Vídeos de Ofertas**.

Teste de aceitação:
- Usar 1 produto real: Sanduicheira Mondial do ciclo Casa/Cozinha.
- Confirmar duas cenas de 10s.
- Confirmar 9:16, avatar hiper-realista e fala pt-BR dentro do prompt.
- Confirmar sincronização labial e continuidade explícitas.
- Confirmar fidelidade visual do produto.
- Confirmar preço e desconto sem invenção.
- Confirmar ausência de urgência falsa, cupom/selos inventados e funções não comprovadas.
- Confirmar que a Cena 2 funciona como continuação e fecha com CTA.
- Confirmar download da imagem via mesmo proxy de Vídeos de Ofertas.
- Confirmar que `/reels` não cria novo fluxo de upload/recorte.
- Nenhum deploy de produção antes da aprovação do resultado.

Validação técnica concluída:
- Vitest focado: 2/2 PASS;
- contrato do prompt final: PASS;
- typecheck somente dos arquivos da Task 1: PASS;
- ESLint somente dos arquivos da Task 1: PASS;
- typecheck global do repositório possui falhas pré-existentes fora deste escopo e não foi usado como gate da Task 1.

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

A métrica final é venda atribuída. Views, retenção, cliques e CTR são métricas de diagnóstico para melhorar o criativo e a distribuição, não o objetivo final.
