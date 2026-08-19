# Conversão Comercial — Task 5 — Teste Comercial Controlado

Data: 2026-08-19

## Objetivo

Montar um teste pequeno e rastreável para medir venda real, usando ofertas já aprovadas e publicadas, sem aumentar volume indiscriminadamente e sem disparar novo deploy.

## Descoberta operacional importante

Ao iniciar a Task 5, cinco ofertas já estavam aprovadas e publicadas no mesmo dia em Facebook e WhatsApp. Portanto, o teste não precisa começar com nova publicação imediata: estes posts passam a formar o baseline comercial de referência.

As copies publicadas ainda seguem o padrão antigo (produto + marketplace + preço + CTA genérico). Isso significa que os resultados atuais servem como baseline do modelo antigo e não como validação das copies revisadas na Task 3.

## Cinco ofertas do baseline

### 1. KIT 3 Camiseta Academia Feminina Dry Fit
- offer_id: `bdbc4c02-34c1-4fd9-b663-5d214a35b523`
- preço: R$ 59,50
- vendas observadas no marketplace: 2.863
- rating: 4,8
- desconto observado: 18%
- comissão efetiva observada: 35%
- comissão estimada por venda: R$ 20,83
- canais publicados no baseline: Facebook e WhatsApp
- Instagram: draft disponível
- cliques no baseline até a leitura: 0
- vendas atribuídas: 0
- criativo recomendado para rodada melhorada: vídeo de usabilidade de moda

### 2. Calça Jogger Preta Masculina Dry Fit
- offer_id: `450fe8c4-3068-4ad8-8140-c9a7d9b9db5a`
- preço: R$ 38,99
- vendas observadas: 2.180
- rating: 4,8
- desconto observado: 22%
- comissão efetiva observada: 29%
- comissão estimada por venda: R$ 11,31
- canais publicados no baseline: Facebook e WhatsApp
- Instagram: draft disponível
- cliques no baseline até a leitura: 0
- vendas atribuídas: 0
- criativo recomendado: vídeo de usabilidade de moda

### 3. Extensão Elétrica 20 Metros
- offer_id: `0dd2537d-b2fb-4e75-823a-04436b83924a`
- preço: R$ 28,80
- vendas observadas: 3.837
- rating: 4,7
- desconto observado: 20%
- comissão efetiva observada: 29%
- comissão estimada por venda: R$ 8,35
- canais publicados no baseline: Facebook e WhatsApp
- Instagram: draft disponível
- cliques no baseline até a leitura: 0
- vendas atribuídas: 0
- criativo recomendado: vídeo de usabilidade/demonstração, sem inventar carga, potência ou aplicações não comprovadas

### 4. Cama/Colchonete Pet Lavável com Zíper
- offer_id: `13671c0f-7b24-4b99-92a0-9bfbaeb6eb10`
- preço: R$ 21,90
- vendas observadas: 2.693
- rating: 4,9
- desconto observado: 39%
- comissão efetiva observada: 13%
- comissão estimada por venda: R$ 2,85
- canais publicados no baseline: Facebook e WhatsApp
- Instagram: draft disponível
- cliques observados: 1 Facebook, classificado como ambíguo pela heurística da Task 1
- vendas atribuídas: 0
- criativo recomendado: imagem oficial ou vídeo curto de uso pet se houver referência real adequada

### 5. Ventilador Mondial 30cm
- offer_id: `2225fe15-4326-4760-bd1c-cdbb9843c8fa`
- preço: R$ 149,99
- vendas observadas: 2.296
- rating: 4,9
- desconto observado: 25%
- comissão efetiva observada: 10%
- comissão estimada por venda: R$ 15,00
- canais publicados no baseline: Facebook e WhatsApp
- Instagram: draft disponível
- cliques observados: 5 Facebook; 4 classificados como `human_probable` e 1 como ambíguo
- vendas atribuídas: 0
- criativo recomendado: imagem oficial no baseline; vídeo de uso somente se preservar fielmente o produto

## Links e rastreabilidade

As cinco ofertas possuem `affiliate_links` separados para Facebook, Instagram e WhatsApp, com `sub_id` por canal e URL interna `/go/...` por oferta/canal. Isso permite medir click_events por oferta e canal sem misturar os resultados.

Telegram não faz parte desta primeira rodada porque estas cinco ofertas não possuem link gerado para esse canal no baseline observado.

## Baseline atual

No momento desta leitura:
- 5 ofertas aprovadas;
- 10 posts publicados: 5 Facebook + 5 WhatsApp;
- 5 drafts Instagram;
- 6 click_events totais no conjunto;
- 4 cliques humanos prováveis, todos no Ventilador Mondial;
- 2 cliques ambíguos (Ventilador + Cama Pet);
- 0 vendas atribuídas.

## Hipóteses por oferta

- Kit camisetas: ticket baixo/médio + comissão forte; hipótese de que demonstração visual de caimento converte melhor do que card estático e copy genérica.
- Calça jogger: produto visual e de uso; hipótese de que vídeo de usabilidade reduz incerteza e melhora intenção.
- Extensão: utilidade clara; hipótese de que demonstração de uso é mais persuasiva que nome técnico longo.
- Cama pet: preço baixo + rating alto + desconto forte; hipótese de compra por impulso/utilidade pet.
- Ventilador: maior ticket, mas marca conhecida + rating alto + comissão unitária relevante; já demonstrou o maior sinal humano inicial.

## Rodada controlada melhorada

A segunda leitura do teste deve usar as mesmas cinco ofertas, evitando trocar produto e copy ao mesmo tempo sem necessidade.

Ordem recomendada:
1. manter o baseline atual sem republicar em massa;
2. gerar vídeos de usabilidade para Kit Camisetas e Calça Jogger;
3. gerar vídeo demonstrativo para Extensão somente se o prompt preservar produto e não inventar uso técnico;
4. Cama Pet e Ventilador podem continuar com imagem oficial inicialmente;
5. aplicar as copies comerciais curtas da Task 3 na rodada seguinte;
6. publicar apenas uma nova versão por oferta/canal escolhido, com horário registrado;
7. medir cliques humanos prováveis e venda atribuída antes de qualquer escala.

## Métricas obrigatórias

Por oferta e canal:
- post publicado e horário;
- clique bruto;
- clique humano provável;
- clique técnico provável/ambíguo;
- venda;
- comissão;
- conversão clique humano provável -> venda.

Não usar CTR se não houver denominador de impressão confiável.

## Critério de aceite da Task 5

A preparação está concluída quando:
- existem 5 ofertas definidas;
- links rastreáveis estão confirmados;
- baseline foi registrado;
- copy/criativo da próxima rodada estão definidos;
- nenhuma nova publicação em massa foi feita apenas para gerar volume.

A observação comercial continua separada da implementação.

**Status: PREPARAÇÃO CONCLUÍDA / TESTE EM OBSERVAÇÃO.**
