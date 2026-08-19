# Conversão Comercial — Task 5 — Teste Comercial Controlado

Data: 2026-08-19

## Objetivo

Montar um teste pequeno e rastreável para medir venda real, usando ofertas já aprovadas e publicadas, sem aumentar volume indiscriminadamente e sem disparar novo deploy.

## Descoberta operacional importante

Ao iniciar a Task 5, cinco ofertas já estavam aprovadas e publicadas no mesmo dia em Facebook e WhatsApp. Portanto, estes posts formam o baseline comercial de referência.

As copies publicadas ainda seguem o padrão antigo (produto + marketplace + preço + CTA genérico). Isso é útil: os resultados atuais servem como baseline do modelo antigo e não serão misturados com a rodada comercial melhorada.

## Cinco ofertas do baseline

### 1. KIT 3 Camiseta Academia Feminina Dry Fit
- offer_id: `bdbc4c02-34c1-4fd9-b663-5d214a35b523`
- preço: R$ 59,50
- vendas observadas: 2.863
- rating: 4,8
- desconto observado: 18%
- comissão efetiva observada: 35%
- comissão estimada por venda: R$ 20,83
- canais publicados no baseline: Facebook e WhatsApp
- Instagram: draft disponível
- criativo da rodada melhorada: vídeo de usabilidade de moda

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
- criativo da rodada melhorada: vídeo de usabilidade de moda

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
- criativo da rodada melhorada: vídeo demonstrativo somente se preservar o produto e não inventar carga, potência ou aplicação técnica

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
- criativo da rodada melhorada: imagem oficial inicialmente; vídeo curto de uso pet apenas se houver referência visual adequada

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
- criativo da rodada melhorada: imagem oficial; vídeo de uso somente se preservar fielmente o produto

## Rastreabilidade confirmada

As cinco ofertas possuem `affiliate_links` separados para Facebook, Instagram e WhatsApp, com `sub_id` por canal e URL interna `/go/...` por oferta/canal. Isso permite medir `click_events` por oferta e canal sem misturar resultados.

Telegram não faz parte desta rodada porque estas cinco ofertas não possuem link gerado para esse canal no baseline observado.

## Baseline registrado

Na leitura de 2026-08-19:
- 5 ofertas aprovadas;
- 10 posts publicados: 5 Facebook + 5 WhatsApp;
- 5 drafts Instagram;
- 6 `click_events` no conjunto;
- 4 cliques `human_probable`, todos no Ventilador Mondial;
- 2 cliques ambíguos;
- 0 vendas atribuídas.

## Rodada comercial melhorada — preparada

A rodada melhorada usa as mesmas cinco ofertas. Não troca produto, marketplace ou preço apenas para gerar movimento. A variável principal passa a ser **copy comercial curta + criativo mais demonstrativo quando agrega**.

### Copy oficial — Facebook

**KIT 3 Camisetas Dry Fit**

`🏋️ Kit com 3 camisetas Dry Fit para treino e caminhada. Já soma 2.863 vendas e 4,8★ na Shopee. Está por R$ 59,50, com 18% OFF. Confira no link do primeiro comentário.`

**Calça Jogger**

`👖 Calça Jogger masculina Dry Fit para treino e uso diário. São 2.180 vendas e 4,8★ na Shopee. Agora por R$ 38,99, com 22% OFF. Confira no primeiro comentário.`

**Extensão 20 m**

`🔌 Extensão elétrica de 20 metros para quem precisa alcançar mais longe sem improviso. O anúncio soma 3.837 vendas e 4,7★. Está por R$ 28,80, com 20% OFF. Confira no primeiro comentário.`

**Cama Pet**

`🐶🐱 Cama pet lavável com zíper por R$ 21,90. O anúncio já soma 2.693 vendas, 4,9★ e 39% OFF. Confira no link do primeiro comentário.`

**Ventilador Mondial 30cm**

`🌬️ Ventilador Mondial 30cm com 2.296 vendas e avaliação 4,9★. Está por R$ 149,99, com 25% OFF. Confira no link do primeiro comentário.`

Regra Facebook: sem URL no corpo; link rastreado permanece no primeiro comentário.

### Copy oficial — WhatsApp

**KIT 3 Camisetas Dry Fit**

`🏋️ Kit com 3 camisetas Dry Fit. 2.863 vendas, 4,8★ e 18% OFF. Agora por R$ 59,50. Confira: https://caca-oferta-oficial.vercel.app/go/wp_bdbc4c02-34c1-4fd9-b663-5d214a35b523`

**Calça Jogger**

`👖 Calça Jogger masculina Dry Fit. 2.180 vendas, 4,8★ e 22% OFF. Agora por R$ 38,99. Confira: https://caca-oferta-oficial.vercel.app/go/wp_450fe8c4-3068-4ad8-8140-c9a7d9b9db5a`

**Extensão 20 m**

`🔌 Extensão elétrica de 20 m. 3.837 vendas, 4,7★ e 20% OFF. Está por R$ 28,80. Confira: https://caca-oferta-oficial.vercel.app/go/wp_0dd2537d-b2fb-4e75-823a-04436b83924a`

**Cama Pet**

`🐶🐱 Cama pet lavável com zíper. 2.693 vendas, 4,9★ e 39% OFF. Agora por R$ 21,90. Confira: https://caca-oferta-oficial.vercel.app/go/wp_13671c0f-7b24-4b99-92a0-9bfbaeb6eb10`

**Ventilador Mondial 30cm**

`🌬️ Ventilador Mondial 30cm. 2.296 vendas, 4,9★ e 25% OFF. Está por R$ 149,99. Confira: https://caca-oferta-oficial.vercel.app/go/wp_2225fe15-4326-4760-bd1c-cdbb9843c8fa`

### Instagram

Instagram não entra como comparação imediata com o baseline porque os cinco itens atuais estão apenas em draft nesse canal. Quando os vídeos de usabilidade forem aprovados, usar a mesma copy curta sem URL na legenda e CTA para vitrine/bio.

### Plano de criativo

- KIT 3 Camisetas: **vídeo de usabilidade**; prioridade alta.
- Calça Jogger: **vídeo de usabilidade**; prioridade alta.
- Extensão 20 m: **vídeo demonstrativo** apenas se fiel à referência; caso contrário, imagem oficial.
- Cama Pet: **imagem oficial** na primeira comparação; vídeo pet é opcional e posterior.
- Ventilador Mondial: **imagem oficial** na primeira comparação; não depender de geração de vídeo para testar venda.

## Regra de publicação da rodada melhorada

Não republicar as cinco ofertas poucas horas após o baseline. Isso contaminaria o teste por repetição/saturação. A rodada melhorada deve ser publicada no próximo ciclo adequado, mantendo exatamente os mesmos `offer_id` e links rastreados.

Cada nova publicação deve registrar:
- oferta;
- canal;
- horário;
- versão de copy (`baseline` ou `conversion_v1`);
- criativo (`image` ou `usability_video`);
- cliques brutos;
- cliques humanos prováveis;
- vendas;
- comissão.

## Comparação mínima

A pergunta não será “qual post teve mais clique bruto?”. A comparação correta será:

`baseline antigo` × `conversion_v1`

por:
- clique humano provável;
- venda atribuída;
- conversão clique humano → venda;
- comissão gerada.

## Critério de aceite da Task 5

A preparação está concluída quando:
- existem 5 ofertas definidas;
- links rastreáveis estão confirmados;
- baseline foi registrado;
- copy final da rodada melhorada está pronta;
- criativo por oferta está definido;
- nenhuma nova publicação em massa foi feita apenas para gerar volume.

**Status: RODADA MELHORADA PREPARADA / AGUARDANDO JANELA DE PUBLICAÇÃO E VÍDEOS DE USABILIDADE.**
