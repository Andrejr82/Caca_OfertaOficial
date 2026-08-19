# Conversão Comercial — Task 6 — Critérios Objetivos de Decisão e Escala

Data: 2026-08-19

## Objetivo

Encerrar o planejamento da frente de Conversão Comercial com regras objetivas para interpretar o teste controlado e decidir o que fazer em seguida sem subjetividade, sem aumentar volume por ansiedade e sem mascarar gargalos.

A Task 6 não cria arquitetura nova. Ela define o contrato de decisão para a rodada `conversion_v1` preparada na Task 5.

## Unidade de análise

A leitura deve ser feita por **oferta + canal + versão da abordagem**.

Para cada combinação registrar:

- offer_id;
- canal;
- horário de publicação;
- versão (`baseline_antigo` ou `conversion_v1`);
- criativo usado (imagem, vídeo de usabilidade, vídeo demonstrativo);
- cliques brutos;
- cliques `human_probable`;
- cliques técnicos/ambíguos;
- vendas atribuídas;
- comissão atribuída;
- conversão de clique humano provável para venda.

Não usar clique bruto isolado como evidência de intenção.

## Janela mínima antes de decidir

Não tomar decisão com base em poucos minutos ou em um único burst de Facebook.

A primeira leitura útil ocorre quando uma destas condições for atendida por oferta/canal:

1. pelo menos **10 cliques humanos prováveis**, ou
2. pelo menos **24 horas** desde a publicação da versão `conversion_v1`.

Se houver venda antes disso, a venda prevalece como sinal comercial e a combinação deve ser preservada para nova validação.

## Matriz de decisão

### Cenário A — Venda atribuída

Condição:
- pelo menos 1 venda atribuída à oferta/canal/versão.

Ação:
- não mudar produto, copy e criativo imediatamente;
- repetir a mesma estrutura em uma segunda publicação controlada;
- validar se ocorre nova venda ou aumento consistente de intenção;
- só depois ampliar para produtos semelhantes.

Classificação: **SINAL COMERCIAL POSITIVO**.

### Cenário B — Clique humano existe, mas zero venda

Condição:
- >= 10 `human_probable` e 0 vendas.

Ação:
- considerar que o gargalo está depois do clique;
- verificar primeiro preço vigente, disponibilidade, reputação, frete/cupom e destino final;
- se a oferta continuar competitiva, não aumentar postagem; substituir a oferta/produto ou o argumento comercial antes de escalar;
- se houver 20+ cliques humanos sem venda, pausar a combinação oferta/canal até nova hipótese concreta.

Classificação: **GARGALO PÓS-CLIQUE**.

### Cenário C — Pouco ou nenhum clique humano

Condição:
- 24h após a publicação e < 3 `human_probable`.

Ação:
- não culpar checkout/marketplace ainda;
- tratar como problema de distribuição, criativo, copy ou aderência produto-audiência;
- testar no máximo uma mudança relevante por nova rodada: criativo **ou** abertura da copy;
- não aumentar frequência indiscriminadamente.

Classificação: **GARGALO PRÉ-CLIQUE**.

### Cenário D — Muitos cliques brutos, poucos humanos

Condição:
- clique bruto cresce, mas `human_probable` permanece baixo e há padrão de burst/desktop técnico.

Ação:
- ignorar crescimento bruto como sucesso;
- não escalar produto nem canal com base nesse contador;
- manter a leitura pela métrica humana provável.

Classificação: **TRÁFEGO TÉCNICO / MÉTRICA CONTAMINADA**.

### Cenário E — Uma oferta vence claramente as demais

Condição:
- venda atribuída ou taxa de intenção humana muito superior às outras ofertas sob exposição comparável.

Ação:
- priorizar a oferta vencedora;
- criar variação somente de copy ou criativo, preservando produto e canal;
- buscar repetição do resultado antes de ampliar categoria.

Classificação: **CANDIDATA À ESCALA**.

## Regra de pausa

Uma oferta/canal deve ser pausada quando ocorrer qualquer uma das condições:

- 20 ou mais cliques humanos prováveis sem venda;
- preço mudou de forma material e destruiu o argumento comercial;
- oferta indisponível;
- link/monetização deixou de ser válido;
- criativo não representa fielmente o produto;
- informação factual usada na copy deixou de ser válida.

Pausa não significa banir permanentemente o produto. Significa parar de consumir distribuição sem uma hipótese nova.

## Regra de escala

Escala só acontece quando houver evidência comercial observável.

Ordem:

1. primeira venda atribuída;
2. repetição controlada da mesma combinação;
3. segunda confirmação de venda ou intenção claramente superior;
4. então ampliar para produtos semelhantes ou mais canais.

Nunca escalar apenas porque houve muitos cliques brutos.

## Papel dos vídeos de usabilidade

Vídeo não é meta por si só. Ele entra quando demonstra algo que a imagem não mostra bem.

Prioridade na rodada atual:

- Kit 3 Camisetas: vídeo de usabilidade/caimento;
- Calça Jogger: vídeo de usabilidade/caimento;
- Extensão 20 m: vídeo demonstrativo somente se não inventar especificações ou aplicações;
- Cama Pet: imagem oficial inicialmente; vídeo apenas se houver referência visual adequada;
- Ventilador Mondial: imagem oficial inicialmente; vídeo apenas se preservar fielmente o modelo.

Se vídeo gerar mais clique humano mas não gerar venda, o resultado é pós-clique e não justificativa para produzir mais vídeos.

## Métrica principal

A métrica primária da frente é:

**venda atribuída / cliques humanos prováveis**

Métricas secundárias:

- comissão atribuída;
- quantidade de ofertas com venda;
- custo operacional por criativo;
- distribuição de cliques humanos por canal.

Clique bruto é apenas diagnóstico técnico.

## Resultado possível da frente

A frente não deve ser considerada bem-sucedida por aumentar volume de posts, vídeos ou cliques.

O primeiro marco de sucesso é:

> **obter nova venda atribuída a uma oferta/canal e conseguir identificar qual combinação comercial produziu o resultado.**

O segundo marco é repetir o resultado com a mesma estrutura ou com uma variação controlada.

## Fechamento da Task 6

Com estas regras, todas as seis Tasks de planejamento/diagnóstico estão concluídas. A partir daqui o trabalho é operacional: publicar a rodada `conversion_v1`, observar os resultados com estes critérios e corrigir apenas o gargalo comprovado.

Nenhuma nova arquitetura, regra de scoring ou aumento de volume será criado antes dessa leitura.

**Status: CONCLUÍDA.**
