# Conversão Comercial — Task 4 — Criativos e Vídeos

Data: 2026-08-19

## Objetivo

Definir, para as 8 ofertas selecionadas na Task 2, qual criativo deve ser usado no primeiro teste comercial controlado: imagem estática, vídeo demonstrativo existente ou novo vídeo curto.

A decisão desta task não presume que vídeo converte melhor que imagem. O histórico atual não possui atribuição suficiente para provar causalidade entre tipo de criativo e venda.

## Evidência histórica observada

A tabela `video_jobs` possui poucos ativos aprovados e muitos jobs automáticos que falharam. No estado analisado:

- `auto-generated-reel`: 9 `failed` e 1 `processing`;
- `google-drive`: 1 `approved`;
- `oracle-extension`: 1 `approved`;
- 1 job adicional `failed` sem source identificado.

Os dois vídeos aprovados pertencem ao mesmo produto histórico, um patinete elétrico, e não às 8 ofertas selecionadas para o teste atual.

Também existe histórico de auto-reel para a máquina de cortar cabelo com cenas de apresentação, preparação, uso e resultado, mas os jobs estão `failed` e sem `video_url` final. Portanto, não há evidência suficiente para usar o pipeline auto-reel como dependência do primeiro teste comercial.

Conclusão factual: hoje não temos biblioteca validada de vídeos aprovados para as 8 ofertas da shortlist. Logo, a Task 5 não deve ficar bloqueada esperando geração de vídeo.

## Princípios para escolha do criativo

1. O produto precisa ser entendido em poucos segundos.
2. Usar vídeo apenas quando movimento/demonstração aumenta materialmente a compreensão.
3. Não gerar vídeo para todos os produtos por padrão.
4. Não atrasar o teste por produção audiovisual.
5. Não reutilizar vídeo de outro produto.
6. Não inferir desempenho de venda a partir de qualidade estética sem atribuição.
7. Preservar identidade real do produto; nada de inventar acessórios, funcionalidades ou resultado.
8. Para o primeiro teste, imagem oficial do marketplace é o fallback padrão seguro.

## Decisão por oferta

### 1. Console Portátil R36S — vídeo demonstrativo recomendado

**Por quê:** produto visual e altamente demonstrável. Gameplay, tela IPS, tamanho físico e navegação são mais fáceis de compreender em movimento.

**Primeiro teste:**
- se existir vídeo real do próprio anúncio/produto, usar esse vídeo após validar identidade;
- se não existir, usar imagem oficial no primeiro ciclo em vez de bloquear o teste;
- um novo vídeo curto só entra numa segunda iteração se houver sinal de interesse sem venda.

**Formato ideal futuro:** 8–15s, produto ligado, tela visível, mãos utilizando, sem promessas extras.

### 2. Percarbonato de sódio — imagem forte no primeiro teste

**Por quê:** benefício é simples e a prova comercial já é forte (vendas, rating, preço). Demonstração de limpeza pode induzir antes/depois difícil de comprovar e criar promessa exagerada.

**Primeiro teste:** imagem oficial limpa + copy comercial.

**Vídeo futuro:** apenas se houver material real e verificável de uso, sem antes/depois fabricado.

### 3. Cama pet lavável com zíper — imagem ou vídeo real curto

**Por quê:** tamanho, formato e uso são imediatamente compreensíveis em imagem; vídeo só agrega se mostrar o pet usando e o zíper/lavabilidade de forma real.

**Primeiro teste:** imagem oficial do produto.

**Formato futuro:** vídeo real de 6–10s com pet usando e detalhe do zíper, sem cenas geradas que alterem produto.

### 4. Ventilador Mondial 30cm — imagem no primeiro teste

**Por quê:** produto conhecido e de compreensão imediata. A decisão comercial depende mais de marca, preço, rating e demanda do que de demonstração visual sofisticada.

**Primeiro teste:** imagem oficial clara com produto inteiro visível.

**Vídeo futuro:** só se houver vídeo real do produto funcionando; não é requisito para validar conversão.

### 5. Mini máquina de costura portátil — vídeo demonstrativo tem alto potencial

**Por quê:** o valor do produto está em entender rapidamente como é segurado e como executa um reparo simples. É um dos itens em que movimento pode reduzir incerteza de compra.

**Primeiro teste:**
- preferir vídeo real do próprio produto caso exista e seja validado;
- na ausência, publicar com imagem oficial para não atrasar o teste.

**Formato ideal futuro:** 8–12s, mão segurando, tecido real, movimento simples de costura; sem prometer resultado profissional.

### 6. Caneta corretiva ZVEV — vídeo demonstrativo recomendado com cautela

**Por quê:** aplicação é visual e rápida, mas maquiagem exige cuidado com claims e representação de resultado.

**Primeiro teste:** imagem oficial se não houver vídeo real já disponível.

**Formato ideal futuro:** aplicação simples do produto, sem antes/depois artificial, sem alegação não observada e sem modificar aparência do produto.

### 7. Brinquedo interativo para gatos com som de pássaro — vídeo real é o melhor formato

**Por quê:** o principal diferencial é comportamento/áudio. Uma imagem não demonstra o som nem a reação do animal.

**Primeiro teste:** preferir vídeo real do próprio anúncio se disponível e validado. Se não houver, imagem oficial ainda permite testar produto/copy sem atrasar a frente.

**Formato ideal:** 6–10s, brinquedo emitindo som e gato interagindo de forma natural.

### 8. Kit 3 tops/sutiãs de academia — imagem no primeiro teste

**Por quê:** produto é melhor avaliado por visual, composição do kit, modelagem e preço. Vídeo gerado adiciona risco de distorção de corpo/peça e pouco ganho para a primeira validação comercial.

**Primeiro teste:** imagem oficial do produto/kit, preservando exatamente o que está incluído.

**Vídeo futuro:** somente material real do próprio produto, se necessário.

## Matriz final do primeiro teste

| Oferta | Criativo do primeiro teste | Vídeo futuro vale a pena? |
|---|---|---|
| Console R36S | vídeo real se disponível; senão imagem | Sim, alto |
| Percarbonato | imagem | Baixo/médio |
| Cama pet | imagem | Médio |
| Ventilador Mondial | imagem | Baixo |
| Mini máquina de costura | vídeo real se disponível; senão imagem | Sim, alto |
| Caneta corretiva | imagem inicialmente | Sim, médio/alto |
| Brinquedo para gatos | vídeo real se disponível; senão imagem | Sim, alto |
| Kit tops academia | imagem | Baixo/médio |

## Decisão operacional

A Task 5 NÃO deve depender de gerar 8 vídeos.

Para o primeiro teste comercial:

- priorizar material real já disponível do próprio produto;
- quando não houver vídeo validado, usar a imagem oficial;
- só produzir novo vídeo para itens com demonstrabilidade alta depois de observar sinal comercial suficiente para justificar o custo/tempo;
- não usar o pipeline `auto-generated-reel` como pré-requisito, pois o histórico atual mostra falhas e não há vídeo aprovado dele para as 8 ofertas.

## Conclusão

O principal erro seria transformar produção audiovisual em nova frente longa antes de provar que os produtos/copies escolhidos conseguem converter. O teste deve começar com criativos simples, fiéis e rastreáveis. Vídeo entra onde demonstra função de forma real e onde houver ativo aprovado ou justificativa comercial posterior.

**Status: CONCLUÍDA.**