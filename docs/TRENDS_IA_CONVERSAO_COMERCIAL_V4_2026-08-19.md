# Tendências IA — Radar Comercial V4

Data: 2026-08-19

## Objetivo

Redesenhar o Radar para responder à pergunta comercial correta: **quais produtos têm evidência suficiente para merecer teste de venda nas redes sociais e potencial econômico relevante para o Caça Ofertas Oficial?**

O objetivo não é maximizar cliques, quantidade de vendas do marketplace ou percentual de desconto isoladamente. O objetivo é gerar uma carteira de oportunidades testáveis que combine probabilidade de conversão, retorno em reais, demanda observada e diversidade comercial.

## Problema comprovado no V3

Na Shopee, a descoberta usa a API oficial de afiliados `productOfferV2`, categorias amplas e `sortType: 2` (popularidade/vendas). Isso tende a entregar itens baratos com grande volume absoluto.

O score V3 também favorece percentual de comissão e desconto, mas não premia adequadamente o valor estimado de comissão por venda nem garante diversidade por faixa de ticket. Consequência: produtos baratos dominam o Top 20 mesmo quando existem oportunidades de ticket médio/alto comercialmente interessantes.

## Princípios do V4 — sem achismo

1. Somente fatos observados do marketplace ou histórico interno verificado.
2. Dados ausentes não podem ser inventados nem tratados como zero quando “desconhecido” é semanticamente diferente de zero.
3. Ticket alto não ganha pontos só por ser caro; precisa de demanda/prova comercial.
4. Ticket baixo não é excluído; continua relevante como compra por impulso.
5. O Top 20 deve ser uma **carteira comercial diversificada**, não uma lista única dominada pelo mesmo perfil.
6. Métrica econômica central: `preço observado × comissão efetiva observada = comissão estimada por venda` quando a comissão estiver disponível.
7. Histórico interno deve considerar apenas sinais de usuários prováveis e vendas atribuídas; clique bruto não é evidência suficiente.
8. Nenhum resultado do Radar publica automaticamente.

## Descoberta Shopee

Manter a API oficial de afiliados como autoridade, mas ampliar o pool antes de selecionar:

- categorias amplas atuais permanecem;
- paginação por categoria deve coletar candidatos suficientes de diferentes faixas de preço;
- além de popularidade, aplicar amostragem por faixa de ticket sobre o pool observado;
- não pesquisar palavras inventadas para forçar itens caros;
- não reservar vaga para um produto sem evidência mínima.

Faixas comerciais iniciais:

- `impulse`: preço < R$ 100;
- `core`: R$ 100 a < R$ 500;
- `upper`: R$ 500 a < R$ 1.500;
- `premium`: R$ 1.500 ou mais.

Essas faixas são instrumento de diversidade, não bônus de score.

## Score V4

Total: 100 pontos.

### 1. Demanda observada — 25

Usar nesta ordem:

- `sales_velocity` apenas quando realmente computada com histórico do mesmo item;
- volume de vendas observado como fallback;
- destaque oficial do marketplace quando disponível.

### 2. Retorno econômico por venda — 20

Quando comissão for observada:

`estimated_commission_per_sale = price × effective_commission_percent / 100`

Sugestão de bandas determinísticas:

- >= R$ 40: 20;
- >= R$ 20: 17;
- >= R$ 10: 14;
- >= R$ 5: 10;
- >= R$ 2: 6;
- > R$ 0: 3.

Quando a comissão for desconhecida, registrar `unknown`; não inventar 0%.

### 3. Conversão interna verificada — 20

Somente dados do Caça Ofertas Oficial:

- venda atribuída ao produto/canal;
- conversão sobre clique humano provável;
- volume mínimo para evitar conclusão sobre amostra minúscula.

Sem amostra suficiente: estado `insufficient_history`, sem penalizar como fracasso.

Clique técnico/ambíguo não pode aumentar este score.

### 4. Qualidade/reputação — 10

Rating observado e, quando houver, volume de avaliações confiável.

### 5. Competitividade da oferta — 10

Desconto observado e integridade de preço. Percentual alto não compensa ausência de demanda.

### 6. Identidade e rastreabilidade — 10

Item ID, shop/product ID, URL oficial, imagem e possibilidade de gerar link afiliado rastreável.

### 7. Potencial visual — 5

Produto demonstrável com imagem/vídeo real e sem necessidade de inventar funcionalidade.

## Seleção final: carteira Top 20

Primeiro rankear candidatos elegíveis pelo Score V4. Depois aplicar diversidade comercial.

Metas de representação, **somente quando existirem candidatos elegíveis suficientes**:

- até 6 `impulse`;
- pelo menos 5 `core`;
- pelo menos 4 `upper`;
- pelo menos 2 `premium`;
- vagas restantes preenchidas pelos melhores scores globais.

Se uma faixa não tiver candidatos com evidência mínima, sua vaga é redistribuída. Nunca preencher quota com produto ruim.

Aplicar também limite de concentração por família/categoria para impedir 20 itens equivalentes.

## Critério de elegibilidade

Um candidato só entra na carteira principal se tiver:

- preço válido;
- identidade verificável;
- ao menos uma evidência factual de demanda/comercialidade;
- rating não reprovado quando disponível;
- link/rota de monetização possível;
- viabilidade `high` ou `medium`.

## Saída obrigatória na UI

Cada oportunidade deve mostrar de forma transparente:

- marketplace;
- preço;
- faixa de ticket;
- vendas/velocidade observada;
- rating;
- desconto;
- comissão percentual observada (ou “desconhecida”);
- comissão estimada em R$ por venda (quando calculável);
- score V4 e breakdown;
- razões determinísticas;
- evidência interna: `sale`, `human_clicks`, `conversion_rate` ou `insufficient_history`.

## Validação de sucesso do V4

Não validar pelo fato de aparecer uma TV, geladeira ou patinete. Isso seria outro achismo.

Validar por:

1. distribuição de ticket do Top 20 não concentrada artificialmente em micro/baixo ticket;
2. produtos de ticket médio/alto aparecem quando têm evidência suficiente;
3. comissão estimada por venda influencia o ranking quando observável;
4. produtos baratos continuam presentes quando comercialmente fortes;
5. nenhuma métrica é fabricada;
6. após publicação controlada, medir venda atribuída por clique humano provável e comissão real.

## Regra de aprendizado

O Radar V4 não deve “aprender” com clique bruto. Após testes reais, o histórico interno passa a influenciar o score apenas com sinais comerciais limpos. A métrica de decisão do negócio continua sendo venda atribuída e comissão, e não volume de postagens ou cliques técnicos.
