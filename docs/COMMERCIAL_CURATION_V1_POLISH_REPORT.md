# Commercial Curation V1

## 1. Resumo executivo

A Curadoria Comercial V1 transforma o dry-run em ranking permanente de candidatos Shopee + Mercado Livre. A execução atual encontrou 444 produtos únicos com preço nas últimas 48h. 93 são candidatos automáticos e 228 exigem revisão manual.

## 2. Arquivos alterados

- `scripts/commercial-curation-v1.cjs` — domínio puro de ranking, gates, riscos, copy e metadata.
- `scripts/dry-run-commercial-matrix.cjs` — adaptado para consumir a camada V1 e gerar relatórios.
- `scripts/__tests__/commercial-curation-v1.test.js` — seams públicas da curadoria.
- `CONTEXT.md` — vocabulário de CommercialIntent, AchadinhoScore e manualReviewRequired.

## 3. Mudanças em relação ao dry-run anterior

- Score contínuo com base limitada a 92 e bônus/penalidades separados; não há saturação indiscriminada em 100.
- Ganchos e bullets separados, sem `/ /`, linhas duplicadas ou repetição do gancho.
- Precedência corrigida para decoração, moda e automotivo; segurança, cadeira gamer e eletrônicos de alto ticket são manual-first.
- `automaticEligible` separa candidatos automáticos de manual-first.

## 4. Novo score

A base do `AchadinhoScore` tem teto 92. Bônus pequenos consideram marketplace preferencial, aderência exata e preço na faixa; penalidades consideram risco manual, duplicidade, categoria fraca e preço fora da faixa. Rating/vendas são exclusivos de sinais Shopee presentes.

## 5. Gates por intenção

| Intenção | Faixa preferencial | Marketplace | Modo | Dados mínimos |
|---|---:|---|---|---|
| utilidade_casa_essencial | 15–180 | shopee | automatic | price, affiliateUrl |
| casa_organizada_antes_depois | 15–250 | shopee | automatic | price, affiliateUrl, imageUrl |
| tech_de_bolso | 15–500 | mercadolivre | automatic | price, affiliateUrl |
| upgrade_trabalho_estudo | 30–700 | mercadolivre | manual-first | price, affiliateUrl |
| look_sem_erro | 20–450 | shopee | manual-first | price, affiliateUrl |
| autocuidado_que_resolve | 15–300 | shopee | manual-first | price, affiliateUrl |
| pet_recorrente_e_util | 15–250 | mercadolivre | manual-first | price, affiliateUrl |
| carro_pratico | 20–600 | mercadolivre | manual-first | price, affiliateUrl |
| faca_voce_mesmo_leve | 15–350 | shopee | automatic | price, affiliateUrl |
| lazer_gamer_acessorio | 20–600 | mercadolivre | manual-first | price, affiliateUrl |
| audio_e_gadget_visual | 20–450 | shopee | automatic | price, affiliateUrl, imageUrl |
| eletro_validado_para_casa | 50–700 | mercadolivre | manual-first | price, affiliateUrl, imageUrl |
| casa_escritorio_comparado | 30–500 | mercadolivre | manual-first | price, affiliateUrl, imageUrl |
| oferta_real_do_dia | 15–500 | shopee | automatic | price, affiliateUrl |
| cupons_verificados_manual | 15–500 | mercadolivre | manual-first | price, affiliateUrl |

## 6. Tratamento Shopee

Rating, vendas, desconto, comissão, tipo de loja, imagem e métricas são usados somente quando presentes no payload/runtime. A copy inclui cada sinal no máximo uma vez.

## 7. Tratamento Mercado Livre

O ranking não cria rating, reviews, vendas, “mais vendido”, loja oficial, cupom ou frete grátis. Frete só aparece quando `shippingFree === true`; categoria e vendedor só aparecem quando campos existem.

## 8. Amazon fora da V1

Amazon permanece no projeto, mas `rankCommercialOffers` aceita somente Shopee e Mercado Livre.

## 9. Copy antes/depois

- Antes: “Achado com dados disponíveis” repetido como gancho e bullet, com separadores `/` no relatório.
- Depois: gancho específico, motivo prático distinto, sinais presentes e no máximo quatro bullets.

## 10. Top geral

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil | R$ 18,33 | beleza_editorial | autocuidado_que_resolve | 89.2 | preço na faixa preferencial; desconto informado de 88%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil · 💰 R$ 18,33 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 4.459 vendas informadas · ✅ Desconto informado de 88% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos | R$ 27,49 | beleza_editorial | autocuidado_que_resolve | 88.9 | preço na faixa preferencial; desconto informado de 77%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos · 💰 R$ 27,49 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.7 · ✅ 3.077 vendas informadas · ✅ Desconto informado de 77% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum | R$ 69,90 | moda_editorial | look_sem_erro | 88.7 | preço na faixa preferencial; desconto informado de 59%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum · 💰 R$ 69,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 9.396 vendas informadas · ✅ Desconto informado de 59% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia | R$ 17,99 | organizacao_editorial | casa_organizada_antes_depois | 88.7 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia · 💰 R$ 17,99 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.8 · ✅ 2.341 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa De Som C/ Microfones Alto-falante Bluetooth Karaoke com Microfone Luz ambiente RGB✨ | R$ 29,99 | tv_audio_editorial | audio_e_gadget_visual | 88.6 | preço na faixa preferencial; desconto informado de 67%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa De Som C/ Microfones Alto-falante Bluetooth Karaoke com Microfone Luz ambiente RGB✨ · 💰 R$ 29,99 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 2.768 vendas informadas · ✅ Desconto informado de 67% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa de Som Bluetooth Portátil RGB com Microfone Sem Fio Karaokê USB TF AUX LED Colorido Mini Speaker Potente | R$ 29,96 | tv_audio_editorial | audio_e_gadget_visual | 88.6 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa de Som Bluetooth Portátil RGB com Microfone Sem Fio Karaokê USB TF AUX LED Colorido Mini Speaker Potente · 💰 R$ 29,96 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 1.924 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Eletrico Feminino Recarregável Removedor De Pelos Navalha Dupla- Envio rápido | R$ 37,88 | beleza_editorial | autocuidado_que_resolve | 88.6 | preço na faixa preferencial; desconto informado de 62%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Eletrico Feminino Recarregável Removedor De Pelos Navalha Dupla- Envio rápido · 💰 R$ 37,88 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 5.683 vendas informadas · ✅ Desconto informado de 62% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Parafusadeira Furadeira  48V 1/2 Bateria  3 funções de Elétrica Sem Fio Impacto Completo Acessórios | R$ 132,00 | ferramentas_editorial | faca_voce_mesmo_leve | 88.3 | preço na faixa preferencial; desconto informado de 76%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Parafusadeira Furadeira  48V 1/2 Bateria  3 funções de Elétrica Sem Fio Impacto Completo Acessórios · 💰 R$ 132,00 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.9 · ✅ 1.249 vendas informadas · ✅ Desconto informado de 76% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Fita Métrica Aço Inoxidável 7.5/10m carbono De Alta Precisão trena Profissional Fluorescente Trava | R$ 32,98 | ferramentas_editorial | faca_voce_mesmo_leve | 88 | preço na faixa preferencial; desconto informado de 79%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Fita Métrica Aço Inoxidável 7.5/10m carbono De Alta Precisão trena Profissional Fluorescente Trava · 💰 R$ 32,98 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.8 · ✅ 847 vendas informadas · ✅ Desconto informado de 79% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Inova caixa de som blootooth Portátil Go 4 Com Bateria Esportiva À Prova D 'Água pen drive FM TWS caixinha de som | R$ 69,90 | tv_audio_editorial | audio_e_gadget_visual | 87.9 | preço na faixa preferencial; desconto informado de 65%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Inova caixa de som blootooth Portátil Go 4 Com Bateria Esportiva À Prova D 'Água pen drive FM TWS caixinha de som · 💰 R$ 69,90 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.9 · ✅ 1.405 vendas informadas · ✅ Desconto informado de 65% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Elétrico Feminino 4 em 1 Barbeador Aparador de Pelos Corporais Nariz e Sobrancelhas Recarregável | R$ 39,90 | beleza_editorial | autocuidado_que_resolve | 87.8 | preço na faixa preferencial; desconto informado de 73%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Elétrico Feminino 4 em 1 Barbeador Aparador de Pelos Corporais Nariz e Sobrancelhas Recarregável · 💰 R$ 39,90 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 680 vendas informadas · ✅ Desconto informado de 73% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Carregador Portátil Indução para Sem fio Bateria Carga 3000/5000/10000mAh | R$ 28,98 | celulares_editorial | tech_de_bolso | 87.7 | preço na faixa preferencial; desconto informado de 61%; imagem disponível | — | 🔥 Acessório tech com preço interessante · Carregador Portátil Indução para Sem fio Bateria Carga 3000/5000/10000mAh · 💰 R$ 28,98 · ✅ Acessório simples para o uso diário · ✅ Avaliação 4.6 · ✅ 1.947 vendas informadas · ✅ Desconto informado de 61% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Kit Ferramentas Completo com Estojo Chaves Alicate Estilete Trena Allen Uso Doméstico Profissional | R$ 19,99 | ferramentas_editorial | faca_voce_mesmo_leve | 87.7 | preço na faixa preferencial; desconto informado de 80%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Kit Ferramentas Completo com Estojo Chaves Alicate Estilete Trena Allen Uso Doméstico Profissional · 💰 R$ 19,99 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.6 · ✅ 581 vendas informadas · ✅ Desconto informado de 80% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Sapateira Suspenso de Porta Organizador Multiuso Divisória Vertical Chinelo | R$ 26,67 | organizacao_editorial | casa_organizada_antes_depois | 87.4 | preço na faixa preferencial; desconto informado de 57%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Sapateira Suspenso de Porta Organizador Multiuso Divisória Vertical Chinelo · 💰 R$ 26,67 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.9 · ✅ 2.185 vendas informadas · ✅ Desconto informado de 57% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Bota Tratorada Feminina Zíper Lateral Sola Alta Cano Baixo Coturno Blogueira Moda Confortável | R$ 79,90 | moda_editorial | look_sem_erro | 87.3 | preço na faixa preferencial; desconto informado de 64%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Bota Tratorada Feminina Zíper Lateral Sola Alta Cano Baixo Coturno Blogueira Moda Confortável · 💰 R$ 79,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 735 vendas informadas · ✅ Desconto informado de 64% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

## 11. Top automático

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia | R$ 17,99 | organizacao_editorial | casa_organizada_antes_depois | 88.7 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia · 💰 R$ 17,99 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.8 · ✅ 2.341 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa De Som C/ Microfones Alto-falante Bluetooth Karaoke com Microfone Luz ambiente RGB✨ | R$ 29,99 | tv_audio_editorial | audio_e_gadget_visual | 88.6 | preço na faixa preferencial; desconto informado de 67%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa De Som C/ Microfones Alto-falante Bluetooth Karaoke com Microfone Luz ambiente RGB✨ · 💰 R$ 29,99 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 2.768 vendas informadas · ✅ Desconto informado de 67% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa de Som Bluetooth Portátil RGB com Microfone Sem Fio Karaokê USB TF AUX LED Colorido Mini Speaker Potente | R$ 29,96 | tv_audio_editorial | audio_e_gadget_visual | 88.6 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa de Som Bluetooth Portátil RGB com Microfone Sem Fio Karaokê USB TF AUX LED Colorido Mini Speaker Potente · 💰 R$ 29,96 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 1.924 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Parafusadeira Furadeira  48V 1/2 Bateria  3 funções de Elétrica Sem Fio Impacto Completo Acessórios | R$ 132,00 | ferramentas_editorial | faca_voce_mesmo_leve | 88.3 | preço na faixa preferencial; desconto informado de 76%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Parafusadeira Furadeira  48V 1/2 Bateria  3 funções de Elétrica Sem Fio Impacto Completo Acessórios · 💰 R$ 132,00 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.9 · ✅ 1.249 vendas informadas · ✅ Desconto informado de 76% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Fita Métrica Aço Inoxidável 7.5/10m carbono De Alta Precisão trena Profissional Fluorescente Trava | R$ 32,98 | ferramentas_editorial | faca_voce_mesmo_leve | 88 | preço na faixa preferencial; desconto informado de 79%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Fita Métrica Aço Inoxidável 7.5/10m carbono De Alta Precisão trena Profissional Fluorescente Trava · 💰 R$ 32,98 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.8 · ✅ 847 vendas informadas · ✅ Desconto informado de 79% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Inova caixa de som blootooth Portátil Go 4 Com Bateria Esportiva À Prova D 'Água pen drive FM TWS caixinha de som | R$ 69,90 | tv_audio_editorial | audio_e_gadget_visual | 87.9 | preço na faixa preferencial; desconto informado de 65%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Inova caixa de som blootooth Portátil Go 4 Com Bateria Esportiva À Prova D 'Água pen drive FM TWS caixinha de som · 💰 R$ 69,90 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.9 · ✅ 1.405 vendas informadas · ✅ Desconto informado de 65% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Carregador Portátil Indução para Sem fio Bateria Carga 3000/5000/10000mAh | R$ 28,98 | celulares_editorial | tech_de_bolso | 87.7 | preço na faixa preferencial; desconto informado de 61%; imagem disponível | — | 🔥 Acessório tech com preço interessante · Carregador Portátil Indução para Sem fio Bateria Carga 3000/5000/10000mAh · 💰 R$ 28,98 · ✅ Acessório simples para o uso diário · ✅ Avaliação 4.6 · ✅ 1.947 vendas informadas · ✅ Desconto informado de 61% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Kit Ferramentas Completo com Estojo Chaves Alicate Estilete Trena Allen Uso Doméstico Profissional | R$ 19,99 | ferramentas_editorial | faca_voce_mesmo_leve | 87.7 | preço na faixa preferencial; desconto informado de 80%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Kit Ferramentas Completo com Estojo Chaves Alicate Estilete Trena Allen Uso Doméstico Profissional · 💰 R$ 19,99 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.6 · ✅ 581 vendas informadas · ✅ Desconto informado de 80% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Sapateira Suspenso de Porta Organizador Multiuso Divisória Vertical Chinelo | R$ 26,67 | organizacao_editorial | casa_organizada_antes_depois | 87.4 | preço na faixa preferencial; desconto informado de 57%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Sapateira Suspenso de Porta Organizador Multiuso Divisória Vertical Chinelo · 💰 R$ 26,67 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.9 · ✅ 2.185 vendas informadas · ✅ Desconto informado de 57% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Varal De Chão 3 Andares Roupa Calcinha Dobrável Grade Reforçado com 4 Rodas Portátil e Compacto | R$ 79,80 | organizacao_editorial | casa_organizada_antes_depois | 87.1 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Varal De Chão 3 Andares Roupa Calcinha Dobrável Grade Reforçado com 4 Rodas Portátil e Compacto · 💰 R$ 79,80 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.9 · ✅ 7.102 vendas informadas · ✅ Desconto informado de 46% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Mop Spray Com Reservatório Esfregão Vassoura Mágica | R$ 37,99 | organizacao_editorial | casa_organizada_antes_depois | 86.9 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Mop Spray Com Reservatório Esfregão Vassoura Mágica · 💰 R$ 37,99 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.7 · ✅ 4.831 vendas informadas · ✅ Desconto informado de 46% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa de Som Bluetooth Externo Prova D'Água IPX5 - TWS Multimídia TWS USB TF FM AUX | R$ 49,96 | tv_audio_editorial | audio_e_gadget_visual | 86.8 | preço na faixa preferencial; desconto informado de 55%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa de Som Bluetooth Externo Prova D'Água IPX5 - TWS Multimídia TWS USB TF FM AUX · 💰 R$ 49,96 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 1.286 vendas informadas · ✅ Desconto informado de 55% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Lixeira Inox 5 Litros Cesto Com Pedal E Balde Removível | R$ 54,99 | organizacao_editorial | casa_organizada_antes_depois | 84.3 | preço na faixa preferencial; desconto informado de 23%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Lixeira Inox 5 Litros Cesto Com Pedal E Balde Removível · 💰 R$ 54,99 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.8 · ✅ 3.425 vendas informadas · ✅ Desconto informado de 23% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Webcam Full HD 1080p com Microfone Embutido - Widescreen USB, Ideal para Videoconferências e Chamadas Online | R$ 44,00 | tv_audio_editorial | audio_e_gadget_visual | 80 | preço na faixa preferencial; desconto informado de 77%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Webcam Full HD 1080p com Microfone Embutido - Widescreen USB, Ideal para Videoconferências e Chamadas Online · 💰 R$ 44,00 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 91 vendas informadas · ✅ Desconto informado de 77% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Webcam Preta Full HD 1080p USB Gira 360º Com Microfone Top Visão Integrado PC Note | R$ 74,90 | tv_audio_editorial | audio_e_gadget_visual | 79.9 | preço na faixa preferencial; desconto informado de 69%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Webcam Preta Full HD 1080p USB Gira 360º Com Microfone Top Visão Integrado PC Note · 💰 R$ 74,90 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.6 · ✅ 89 vendas informadas · ✅ Desconto informado de 69% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

## 12. Top manual-first

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil | R$ 18,33 | beleza_editorial | autocuidado_que_resolve | 89.2 | preço na faixa preferencial; desconto informado de 88%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil · 💰 R$ 18,33 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 4.459 vendas informadas · ✅ Desconto informado de 88% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos | R$ 27,49 | beleza_editorial | autocuidado_que_resolve | 88.9 | preço na faixa preferencial; desconto informado de 77%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos · 💰 R$ 27,49 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.7 · ✅ 3.077 vendas informadas · ✅ Desconto informado de 77% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum | R$ 69,90 | moda_editorial | look_sem_erro | 88.7 | preço na faixa preferencial; desconto informado de 59%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum · 💰 R$ 69,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 9.396 vendas informadas · ✅ Desconto informado de 59% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Eletrico Feminino Recarregável Removedor De Pelos Navalha Dupla- Envio rápido | R$ 37,88 | beleza_editorial | autocuidado_que_resolve | 88.6 | preço na faixa preferencial; desconto informado de 62%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Eletrico Feminino Recarregável Removedor De Pelos Navalha Dupla- Envio rápido · 💰 R$ 37,88 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 5.683 vendas informadas · ✅ Desconto informado de 62% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Elétrico Feminino 4 em 1 Barbeador Aparador de Pelos Corporais Nariz e Sobrancelhas Recarregável | R$ 39,90 | beleza_editorial | autocuidado_que_resolve | 87.8 | preço na faixa preferencial; desconto informado de 73%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Elétrico Feminino 4 em 1 Barbeador Aparador de Pelos Corporais Nariz e Sobrancelhas Recarregável · 💰 R$ 39,90 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 680 vendas informadas · ✅ Desconto informado de 73% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Bota Tratorada Feminina Zíper Lateral Sola Alta Cano Baixo Coturno Blogueira Moda Confortável | R$ 79,90 | moda_editorial | look_sem_erro | 87.3 | preço na faixa preferencial; desconto informado de 64%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Bota Tratorada Feminina Zíper Lateral Sola Alta Cano Baixo Coturno Blogueira Moda Confortável · 💰 R$ 79,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 735 vendas informadas · ✅ Desconto informado de 64% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Kit Sobrancelha Henna makiaj+Palito+Navalha+Paquímetro+Tesoura+Pincel+Dappen+Lápis Dermatografico | R$ 34,98 | beleza_editorial | autocuidado_que_resolve | 86.4 | preço na faixa preferencial; desconto informado de 55%; imagem disponível | — | 🔥 Achado prático para autocuidado · Kit Sobrancelha Henna makiaj+Palito+Navalha+Paquímetro+Tesoura+Pincel+Dappen+Lápis Dermatografico · 💰 R$ 34,98 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.9 · ✅ 810 vendas informadas · ✅ Desconto informado de 55% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Conjunto de Academia /Corrida Feminino Fitness Calça Legging Zero Transparência Cintura Alta | R$ 53,99 | moda_editorial | look_sem_erro | 86.1 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Conjunto de Academia /Corrida Feminino Fitness Calça Legging Zero Transparência Cintura Alta · 💰 R$ 53,99 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 1.761 vendas informadas · ✅ Desconto informado de 46% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Fonte De Alimentação Para Xbox One Bivolt - Envio Imediato | R$ 94,57 | games_editorial | lazer_gamer_acessorio | 85.9 | preço na faixa preferencial; desconto informado de 55%; imagem disponível | — | 🔥 Acessório gamer para curtir melhor · Fonte De Alimentação Para Xbox One Bivolt - Envio Imediato · 💰 R$ 94,57 · ✅ Acessório para complementar o lazer · ✅ Avaliação 4.6 · ✅ 413 vendas informadas · ✅ Desconto informado de 55% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Fonte De Alimentação Para Xbox One Bivolt - Envio Imediato | R$ 93,61 | games_editorial | lazer_gamer_acessorio | 85.9 | preço na faixa preferencial; desconto informado de 55%; imagem disponível | — | 🔥 Acessório gamer para curtir melhor · Fonte De Alimentação Para Xbox One Bivolt - Envio Imediato · 💰 R$ 93,61 · ✅ Acessório para complementar o lazer · ✅ Avaliação 4.6 · ✅ 405 vendas informadas · ✅ Desconto informado de 55% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Legging Suplex Fitness Pronta Entrega Zero Transparência | R$ 21,99 | esporte_editorial | look_sem_erro | 85.6 | preço na faixa preferencial; desconto informado de 37%; imagem disponível | — | 🔥 Achado para compor o look · Legging Suplex Fitness Pronta Entrega Zero Transparência · 💰 R$ 21,99 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.7 · ✅ 3.009 vendas informadas · ✅ Desconto informado de 37% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | TENIS FEMININO CASUAL PLATAFORMA  ESTILOSO NA PROMOÇÃO | R$ 48,80 | moda_editorial | look_sem_erro | 85.6 | preço na faixa preferencial; desconto informado de 39%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · TENIS FEMININO CASUAL PLATAFORMA  ESTILOSO NA PROMOÇÃO · 💰 R$ 48,80 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 2.215 vendas informadas · ✅ Desconto informado de 39% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | TENIS FEMININO CASUAL PLATAFORMA  ESTILOSO NA PROMOÇÃO | R$ 49,60 | moda_editorial | look_sem_erro | 85.5 | preço na faixa preferencial; desconto informado de 38%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · TENIS FEMININO CASUAL PLATAFORMA  ESTILOSO NA PROMOÇÃO · 💰 R$ 49,60 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 2.245 vendas informadas · ✅ Desconto informado de 38% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Tenis Masculino Escolar Academia Original FREEDOM Corrida Caminhada Lançamento PRETO e DOURADO | R$ 47,90 | moda_editorial | look_sem_erro | 85.5 | preço na faixa preferencial; desconto informado de 39%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Tenis Masculino Escolar Academia Original FREEDOM Corrida Caminhada Lançamento PRETO e DOURADO · 💰 R$ 47,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 2.088 vendas informadas · ✅ Desconto informado de 39% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Bota Feminina Social Bico Fino Salto Médio Confortável Moda Blogueira Boho | R$ 79,90 | moda_editorial | look_sem_erro | 85.4 | preço na faixa preferencial; desconto informado de 43%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Bota Feminina Social Bico Fino Salto Médio Confortável Moda Blogueira Boho · 💰 R$ 79,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.9 · ✅ 956 vendas informadas · ✅ Desconto informado de 43% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

## 13. Top por intenção

### utilidade_casa_essencial

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Mercado Livre | Par Halter Emborrachado 3 Kg Treino Academia Em Casa Cor Preto | R$ 78,99 | casa_cozinha_editorial | utilidade_casa_essencial | 62 | preço na faixa preferencial; imagem disponível; link disponível | — | 🔥 Pra resolver a rotina da casa · Par Halter Emborrachado 3 Kg Treino Academia Em Casa Cor Preto · 💰 R$ 78,99 · ✅ Ajuda a resolver uma tarefa da casa · ✅ Categoria: Halteres · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Colchonete Para Academia 90x45 Ginástica Exercícios Yoga Pilates D80 | R$ 60,99 | esporte_editorial | utilidade_casa_essencial | 62 | preço na faixa preferencial; imagem disponível; link disponível | — | 🔥 Pra resolver a rotina da casa · Colchonete Para Academia 90x45 Ginástica Exercícios Yoga Pilates D80 · 💰 R$ 60,99 · ✅ Ajuda a resolver uma tarefa da casa · ✅ Categoria: Tapetes e Colchonetes · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Tapete Yoga Mat Colchonete Tatame 1,70mx55cmx5mm Exercício em Casa | R$ 29,87 | casa_cozinha_editorial | utilidade_casa_essencial | 61.2 | preço na faixa preferencial; desconto informado de 12%; imagem disponível | marketplace_metrics_missing | 🔥 Pra resolver a rotina da casa · Tapete Yoga Mat Colchonete Tatame 1,70mx55cmx5mm Exercício em Casa · 💰 R$ 29,87 · ✅ Ajuda a resolver uma tarefa da casa · ✅ Desconto informado de 12% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### casa_organizada_antes_depois

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia | R$ 17,99 | organizacao_editorial | casa_organizada_antes_depois | 88.7 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia · 💰 R$ 17,99 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.8 · ✅ 2.341 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Sapateira Suspenso de Porta Organizador Multiuso Divisória Vertical Chinelo | R$ 26,67 | organizacao_editorial | casa_organizada_antes_depois | 87.4 | preço na faixa preferencial; desconto informado de 57%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Sapateira Suspenso de Porta Organizador Multiuso Divisória Vertical Chinelo · 💰 R$ 26,67 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.9 · ✅ 2.185 vendas informadas · ✅ Desconto informado de 57% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Varal De Chão 3 Andares Roupa Calcinha Dobrável Grade Reforçado com 4 Rodas Portátil e Compacto | R$ 79,80 | organizacao_editorial | casa_organizada_antes_depois | 87.1 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Varal De Chão 3 Andares Roupa Calcinha Dobrável Grade Reforçado com 4 Rodas Portátil e Compacto · 💰 R$ 79,80 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.9 · ✅ 7.102 vendas informadas · ✅ Desconto informado de 46% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### tech_de_bolso

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Carregador Portátil Indução para Sem fio Bateria Carga 3000/5000/10000mAh | R$ 28,98 | celulares_editorial | tech_de_bolso | 87.7 | preço na faixa preferencial; desconto informado de 61%; imagem disponível | — | 🔥 Acessório tech com preço interessante · Carregador Portátil Indução para Sem fio Bateria Carga 3000/5000/10000mAh · 💰 R$ 28,98 · ✅ Acessório simples para o uso diário · ✅ Avaliação 4.6 · ✅ 1.947 vendas informadas · ✅ Desconto informado de 61% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | 6 kits Suporte Camera Celular Capacete Queixo e Smartphones - Ideal para Motociclismo e Aventur | R$ 22,99 | celulares_editorial | tech_de_bolso | 77.8 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | electronics_high_ticket_manual | 🔥 Acessório tech com preço interessante · 6 kits Suporte Camera Celular Capacete Queixo e Smartphones - Ideal para Motociclismo e Aventur · 💰 R$ 22,99 · ✅ Acessório simples para o uso diário · ✅ Avaliação 4.9 · ✅ 704 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Kit 3 Capa Prova Dagua Celular Cores Sortidas Capinha Impermeável Universal Gurumania | R$ 22,95 | celulares_editorial | tech_de_bolso | 69.1 | preço na faixa preferencial; desconto informado de 41%; imagem disponível | — | 🔥 Acessório tech com preço interessante · Kit 3 Capa Prova Dagua Celular Cores Sortidas Capinha Impermeável Universal Gurumania · 💰 R$ 22,95 · ✅ Acessório simples para o uso diário · ✅ Desconto informado de 41% · ✅ Categoria: Capas · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### upgrade_trabalho_estudo

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Emeet S800 Webcam Câmera 4k 30Fps Hdr Kit Videoconferencia 1080p 60fps Para Pc NS2 Uhd Streamcam | R$ 599,99 | grandes_ofertas_editorial | upgrade_trabalho_estudo | 76.3 | preço na faixa preferencial; desconto informado de 33%; imagem disponível | — | 🔥 Upgrade prático para trabalho ou estudo · Emeet S800 Webcam Câmera 4k 30Fps Hdr Kit Videoconferencia 1080p 60fps Para Pc NS2 Uhd Streamcam · 💰 R$ 599,99 · ✅ Pode melhorar a rotina de trabalho ou estudo · ✅ Avaliação 5.0 · ✅ 89 vendas informadas · ✅ Desconto informado de 33% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Câmera Digital Para Webcam De Polegar 1080P HD Portátil Retro Chaveiro Cam Vlog Tiro Diário Presente Aniversário | R$ 32,69 | ferramentas_editorial | upgrade_trabalho_estudo | 76.2 | preço na faixa preferencial; desconto informado de 32%; imagem disponível | — | 🔥 Upgrade prático para trabalho ou estudo · Câmera Digital Para Webcam De Polegar 1080P HD Portátil Retro Chaveiro Cam Vlog Tiro Diário Presente Aniversário · 💰 R$ 32,69 · ✅ Pode melhorar a rotina de trabalho ou estudo · ✅ Avaliação 4.6 · ✅ 99 vendas informadas · ✅ Desconto informado de 32% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Webcam EMEET PIXY 4k Ai Tracking Autofoco Câmera Dupla 300° Ptz Câmera Para Pc TV Streaming | R$ 559,99 | grandes_ofertas_editorial | upgrade_trabalho_estudo | 76 | preço na faixa preferencial; desconto informado de 30%; imagem disponível | — | 🔥 Upgrade prático para trabalho ou estudo · Webcam EMEET PIXY 4k Ai Tracking Autofoco Câmera Dupla 300° Ptz Câmera Para Pc TV Streaming · 💰 R$ 559,99 · ✅ Pode melhorar a rotina de trabalho ou estudo · ✅ Avaliação 5.0 · ✅ 86 vendas informadas · ✅ Desconto informado de 30% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### look_sem_erro

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum | R$ 69,90 | moda_editorial | look_sem_erro | 88.7 | preço na faixa preferencial; desconto informado de 59%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum · 💰 R$ 69,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 9.396 vendas informadas · ✅ Desconto informado de 59% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Bota Tratorada Feminina Zíper Lateral Sola Alta Cano Baixo Coturno Blogueira Moda Confortável | R$ 79,90 | moda_editorial | look_sem_erro | 87.3 | preço na faixa preferencial; desconto informado de 64%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Bota Tratorada Feminina Zíper Lateral Sola Alta Cano Baixo Coturno Blogueira Moda Confortável · 💰 R$ 79,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 735 vendas informadas · ✅ Desconto informado de 64% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Conjunto de Academia /Corrida Feminino Fitness Calça Legging Zero Transparência Cintura Alta | R$ 53,99 | moda_editorial | look_sem_erro | 86.1 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Conjunto de Academia /Corrida Feminino Fitness Calça Legging Zero Transparência Cintura Alta · 💰 R$ 53,99 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 1.761 vendas informadas · ✅ Desconto informado de 46% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### autocuidado_que_resolve

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil | R$ 18,33 | beleza_editorial | autocuidado_que_resolve | 89.2 | preço na faixa preferencial; desconto informado de 88%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil · 💰 R$ 18,33 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 4.459 vendas informadas · ✅ Desconto informado de 88% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos | R$ 27,49 | beleza_editorial | autocuidado_que_resolve | 88.9 | preço na faixa preferencial; desconto informado de 77%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos · 💰 R$ 27,49 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.7 · ✅ 3.077 vendas informadas · ✅ Desconto informado de 77% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Eletrico Feminino Recarregável Removedor De Pelos Navalha Dupla- Envio rápido | R$ 37,88 | beleza_editorial | autocuidado_que_resolve | 88.6 | preço na faixa preferencial; desconto informado de 62%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Eletrico Feminino Recarregável Removedor De Pelos Navalha Dupla- Envio rápido · 💰 R$ 37,88 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 5.683 vendas informadas · ✅ Desconto informado de 62% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### pet_recorrente_e_util

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Caixa de Transporte N 4 ou 5 Cachorro Gato Coelho Caixa de Transporte Pet 2 Travas 1 Alça | R$ 49,99 | organizacao_editorial | pet_recorrente_e_util | 81.9 | preço na faixa preferencial; desconto informado de 22%; imagem disponível | — | 🔥 Achado útil para pet no dia a dia · Caixa de Transporte N 4 ou 5 Cachorro Gato Coelho Caixa de Transporte Pet 2 Travas 1 Alça · 💰 R$ 49,99 · ✅ Útil para uma necessidade recorrente do pet · ✅ Avaliação 4.7 · ✅ 152 vendas informadas · ✅ Desconto informado de 22% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Coleira Ajustável Para Animais De Estimação PawBliss Com Sino , Colar De Nylon Cães E Gatos Raças Pequenas , Poodle De P | R$ 3,35 | pet_editorial | pet_recorrente_e_util | 74.9 | preço disponível fora da faixa preferencial; desconto informado de 69%; imagem disponível | — | 🔥 Achado útil para pet no dia a dia · Coleira Ajustável Para Animais De Estimação PawBliss Com Sino , Colar De Nylon Cães E Gatos Raças Pequenas , Poodle De P · 💰 R$ 3,35 · ✅ Útil para uma necessidade recorrente do pet · ✅ Avaliação 4.9 · ✅ 3.288 vendas informadas · ✅ Desconto informado de 69% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Peitoral e Guia para Cachorro Coleira Caes E Gatos Colete Regulavel Confortavel para Pet Pequeno | R$ 14,84 | pet_editorial | pet_recorrente_e_util | 73.4 | preço disponível fora da faixa preferencial; desconto informado de 63%; imagem disponível | — | 🔥 Achado útil para pet no dia a dia · Peitoral e Guia para Cachorro Coleira Caes E Gatos Colete Regulavel Confortavel para Pet Pequeno · 💰 R$ 14,84 · ✅ Útil para uma necessidade recorrente do pet · ✅ Avaliação 4.9 · ✅ 989 vendas informadas · ✅ Desconto informado de 63% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### carro_pratico

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Indicador Do Sensor Das Tampas Da Válvula Monitor De Pressão Dos Pneus Para Motocicleta Carro | R$ 6,35 | informatica_editorial | carro_pratico | 74.1 | preço disponível fora da faixa preferencial; desconto informado de 74%; imagem disponível | — | 🔥 Praticidade para cuidar do carro · Indicador Do Sensor Das Tampas Da Válvula Monitor De Pressão Dos Pneus Para Motocicleta Carro · 💰 R$ 6,35 · ✅ Ajuda em uma tarefa prática do carro · ✅ Avaliação 4.6 · ✅ 941 vendas informadas · ✅ Desconto informado de 74% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### faca_voce_mesmo_leve

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Parafusadeira Furadeira  48V 1/2 Bateria  3 funções de Elétrica Sem Fio Impacto Completo Acessórios | R$ 132,00 | ferramentas_editorial | faca_voce_mesmo_leve | 88.3 | preço na faixa preferencial; desconto informado de 76%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Parafusadeira Furadeira  48V 1/2 Bateria  3 funções de Elétrica Sem Fio Impacto Completo Acessórios · 💰 R$ 132,00 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.9 · ✅ 1.249 vendas informadas · ✅ Desconto informado de 76% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Fita Métrica Aço Inoxidável 7.5/10m carbono De Alta Precisão trena Profissional Fluorescente Trava | R$ 32,98 | ferramentas_editorial | faca_voce_mesmo_leve | 88 | preço na faixa preferencial; desconto informado de 79%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Fita Métrica Aço Inoxidável 7.5/10m carbono De Alta Precisão trena Profissional Fluorescente Trava · 💰 R$ 32,98 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.8 · ✅ 847 vendas informadas · ✅ Desconto informado de 79% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Kit Ferramentas Completo com Estojo Chaves Alicate Estilete Trena Allen Uso Doméstico Profissional | R$ 19,99 | ferramentas_editorial | faca_voce_mesmo_leve | 87.7 | preço na faixa preferencial; desconto informado de 80%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Kit Ferramentas Completo com Estojo Chaves Alicate Estilete Trena Allen Uso Doméstico Profissional · 💰 R$ 19,99 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.6 · ✅ 581 vendas informadas · ✅ Desconto informado de 80% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### lazer_gamer_acessorio

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Fonte De Alimentação Para Xbox One Bivolt - Envio Imediato | R$ 94,57 | games_editorial | lazer_gamer_acessorio | 85.9 | preço na faixa preferencial; desconto informado de 55%; imagem disponível | — | 🔥 Acessório gamer para curtir melhor · Fonte De Alimentação Para Xbox One Bivolt - Envio Imediato · 💰 R$ 94,57 · ✅ Acessório para complementar o lazer · ✅ Avaliação 4.6 · ✅ 413 vendas informadas · ✅ Desconto informado de 55% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Fonte De Alimentação Para Xbox One Bivolt - Envio Imediato | R$ 93,61 | games_editorial | lazer_gamer_acessorio | 85.9 | preço na faixa preferencial; desconto informado de 55%; imagem disponível | — | 🔥 Acessório gamer para curtir melhor · Fonte De Alimentação Para Xbox One Bivolt - Envio Imediato · 💰 R$ 93,61 · ✅ Acessório para complementar o lazer · ✅ Avaliação 4.6 · ✅ 405 vendas informadas · ✅ Desconto informado de 55% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Jogo de lençol soft flanel plush casal Queen e solteiro 3 peças com elástico | R$ 51,89 | games_editorial | lazer_gamer_acessorio | 84.2 | preço na faixa preferencial; desconto informado de 22%; imagem disponível | — | 🔥 Acessório gamer para curtir melhor · Jogo de lençol soft flanel plush casal Queen e solteiro 3 peças com elástico · 💰 R$ 51,89 · ✅ Acessório para complementar o lazer · ✅ Avaliação 4.9 · ✅ 3.192 vendas informadas · ✅ Desconto informado de 22% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### audio_e_gadget_visual

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Caixa De Som C/ Microfones Alto-falante Bluetooth Karaoke com Microfone Luz ambiente RGB✨ | R$ 29,99 | tv_audio_editorial | audio_e_gadget_visual | 88.6 | preço na faixa preferencial; desconto informado de 67%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa De Som C/ Microfones Alto-falante Bluetooth Karaoke com Microfone Luz ambiente RGB✨ · 💰 R$ 29,99 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 2.768 vendas informadas · ✅ Desconto informado de 67% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa de Som Bluetooth Portátil RGB com Microfone Sem Fio Karaokê USB TF AUX LED Colorido Mini Speaker Potente | R$ 29,96 | tv_audio_editorial | audio_e_gadget_visual | 88.6 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa de Som Bluetooth Portátil RGB com Microfone Sem Fio Karaokê USB TF AUX LED Colorido Mini Speaker Potente · 💰 R$ 29,96 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 1.924 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Inova caixa de som blootooth Portátil Go 4 Com Bateria Esportiva À Prova D 'Água pen drive FM TWS caixinha de som | R$ 69,90 | tv_audio_editorial | audio_e_gadget_visual | 87.9 | preço na faixa preferencial; desconto informado de 65%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Inova caixa de som blootooth Portátil Go 4 Com Bateria Esportiva À Prova D 'Água pen drive FM TWS caixinha de som · 💰 R$ 69,90 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.9 · ✅ 1.405 vendas informadas · ✅ Desconto informado de 65% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### eletro_validado_para_casa

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Escova de Limpeza Multifuncional Flexível Para Garrafas Mamadeiras Liquidificador De Silicone | R$ 9,97 | casa_cozinha_editorial | eletro_validado_para_casa | 73.9 | preço disponível fora da faixa preferencial; desconto informado de 62%; imagem disponível | — | 🔥 Eletro para facilitar a rotina da casa · Escova de Limpeza Multifuncional Flexível Para Garrafas Mamadeiras Liquidificador De Silicone · 💰 R$ 9,97 · ✅ Pode facilitar uma tarefa da casa · ✅ Avaliação 4.8 · ✅ 2.275 vendas informadas · ✅ Desconto informado de 62% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Cafeteira Elétrica Electrolux 15 Xícaras Inox Preta Ecm10 Grafite | R$ 115,68 | eletrodomesticos_editorial | eletro_validado_para_casa | 71.1 | preço na faixa preferencial; desconto informado de 11%; imagem disponível | — | 🔥 Eletro para facilitar a rotina da casa · Cafeteira Elétrica Electrolux 15 Xícaras Inox Preta Ecm10 Grafite · 💰 R$ 115,68 · ✅ Pode facilitar uma tarefa da casa · ✅ Desconto informado de 11% · ✅ Categoria: Cafeteiras · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Cafeteira Nescafé Dolce Gusto Arno Mini Me Preta | R$ 450,00 | eletrodomesticos_editorial | eletro_validado_para_casa | 67 | preço na faixa preferencial; imagem disponível; link disponível | — | 🔥 Eletro para facilitar a rotina da casa · Cafeteira Nescafé Dolce Gusto Arno Mini Me Preta · 💰 R$ 450,00 · ✅ Pode facilitar uma tarefa da casa · ✅ Categoria: Cafeteiras · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### casa_escritorio_comparado

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Câmera A8 Externa Ip A Prova D'água - Infravermelho Alarme Wifi Hd Sensor De Movimento - Bivolt | R$ 96,80 | grandes_ofertas_editorial | casa_escritorio_comparado | 67.7 | preço na faixa preferencial; desconto informado de 68%; imagem disponível | category_requires_manual; security_camera_manual | 🔥 Boa opção para casa ou escritório · Câmera A8 Externa Ip A Prova D'água - Infravermelho Alarme Wifi Hd Sensor De Movimento - Bivolt · 💰 R$ 96,80 · ✅ Opção para comparar conforme sua necessidade · ✅ Avaliação 4.8 · ✅ 754 vendas informadas · ✅ Desconto informado de 68% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Câmera IP Knup Full HD 1080p Yoosee Externa Wi-Fi LB-CA244 Original | R$ 79,80 | grandes_ofertas_editorial | casa_escritorio_comparado | 67.2 | preço na faixa preferencial; desconto informado de 74%; imagem disponível | category_requires_manual; security_camera_manual | 🔥 Boa opção para casa ou escritório · Câmera IP Knup Full HD 1080p Yoosee Externa Wi-Fi LB-CA244 Original · 💰 R$ 79,80 · ✅ Opção para comparar conforme sua necessidade · ✅ Avaliação 4.9 · ✅ 280 vendas informadas · ✅ Desconto informado de 74% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Câmera A8 Externa Ip A Prova D'água - Infravermelho Alarme Wifi Hd Sensor De Movimento Bivolt | R$ 109,60 | grandes_ofertas_editorial | casa_escritorio_comparado | 66.6 | preço na faixa preferencial; desconto informado de 63%; imagem disponível | category_requires_manual; security_camera_manual | 🔥 Boa opção para casa ou escritório · Câmera A8 Externa Ip A Prova D'água - Infravermelho Alarme Wifi Hd Sensor De Movimento Bivolt · 💰 R$ 109,60 · ✅ Opção para comparar conforme sua necessidade · ✅ Avaliação 4.8 · ✅ 320 vendas informadas · ✅ Desconto informado de 63% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### oferta_real_do_dia

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Kit 2 Short Feminino Alfaiataria Social com dois Cinto Cintura Alta PROMOÇÃO | R$ 39,90 | grandes_ofertas_editorial | oferta_real_do_dia | 57 | preço na faixa preferencial; imagem disponível; link disponível | marketplace_metrics_missing | 🔥 Oferta forte para olhar agora · Kit 2 Short Feminino Alfaiataria Social com dois Cinto Cintura Alta PROMOÇÃO · 💰 R$ 39,90 · ✅ Preço e condições para conferir · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

### cupons_verificados_manual

Sem produto elegível observado na janela.

## 14. Top Shopee

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Shopee | Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil | R$ 18,33 | beleza_editorial | autocuidado_que_resolve | 89.2 | preço na faixa preferencial; desconto informado de 88%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil · 💰 R$ 18,33 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 4.459 vendas informadas · ✅ Desconto informado de 88% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos | R$ 27,49 | beleza_editorial | autocuidado_que_resolve | 88.9 | preço na faixa preferencial; desconto informado de 77%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos · 💰 R$ 27,49 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.7 · ✅ 3.077 vendas informadas · ✅ Desconto informado de 77% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum | R$ 69,90 | moda_editorial | look_sem_erro | 88.7 | preço na faixa preferencial; desconto informado de 59%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum · 💰 R$ 69,90 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 9.396 vendas informadas · ✅ Desconto informado de 59% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia | R$ 17,99 | organizacao_editorial | casa_organizada_antes_depois | 88.7 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia · 💰 R$ 17,99 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.8 · ✅ 2.341 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa De Som C/ Microfones Alto-falante Bluetooth Karaoke com Microfone Luz ambiente RGB✨ | R$ 29,99 | tv_audio_editorial | audio_e_gadget_visual | 88.6 | preço na faixa preferencial; desconto informado de 67%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa De Som C/ Microfones Alto-falante Bluetooth Karaoke com Microfone Luz ambiente RGB✨ · 💰 R$ 29,99 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 2.768 vendas informadas · ✅ Desconto informado de 67% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa de Som Bluetooth Portátil RGB com Microfone Sem Fio Karaokê USB TF AUX LED Colorido Mini Speaker Potente | R$ 29,96 | tv_audio_editorial | audio_e_gadget_visual | 88.6 | preço na faixa preferencial; desconto informado de 70%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa de Som Bluetooth Portátil RGB com Microfone Sem Fio Karaokê USB TF AUX LED Colorido Mini Speaker Potente · 💰 R$ 29,96 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 1.924 vendas informadas · ✅ Desconto informado de 70% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Depilador Eletrico Feminino Recarregável Removedor De Pelos Navalha Dupla- Envio rápido | R$ 37,88 | beleza_editorial | autocuidado_que_resolve | 88.6 | preço na faixa preferencial; desconto informado de 62%; imagem disponível | — | 🔥 Achado prático para autocuidado · Depilador Eletrico Feminino Recarregável Removedor De Pelos Navalha Dupla- Envio rápido · 💰 R$ 37,88 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.8 · ✅ 5.683 vendas informadas · ✅ Desconto informado de 62% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Parafusadeira Furadeira  48V 1/2 Bateria  3 funções de Elétrica Sem Fio Impacto Completo Acessórios | R$ 132,00 | ferramentas_editorial | faca_voce_mesmo_leve | 88.3 | preço na faixa preferencial; desconto informado de 76%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Parafusadeira Furadeira  48V 1/2 Bateria  3 funções de Elétrica Sem Fio Impacto Completo Acessórios · 💰 R$ 132,00 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.9 · ✅ 1.249 vendas informadas · ✅ Desconto informado de 76% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Fita Métrica Aço Inoxidável 7.5/10m carbono De Alta Precisão trena Profissional Fluorescente Trava | R$ 32,98 | ferramentas_editorial | faca_voce_mesmo_leve | 88 | preço na faixa preferencial; desconto informado de 79%; imagem disponível | — | 🔥 Ferramenta útil para resolver em casa · Fita Métrica Aço Inoxidável 7.5/10m carbono De Alta Precisão trena Profissional Fluorescente Trava · 💰 R$ 32,98 · ✅ Útil para pequenos reparos em casa · ✅ Avaliação 4.8 · ✅ 847 vendas informadas · ✅ Desconto informado de 79% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Inova caixa de som blootooth Portátil Go 4 Com Bateria Esportiva À Prova D 'Água pen drive FM TWS caixinha de som | R$ 69,90 | tv_audio_editorial | audio_e_gadget_visual | 87.9 | preço na faixa preferencial; desconto informado de 65%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Inova caixa de som blootooth Portátil Go 4 Com Bateria Esportiva À Prova D 'Água pen drive FM TWS caixinha de som · 💰 R$ 69,90 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.9 · ✅ 1.405 vendas informadas · ✅ Desconto informado de 65% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

## 15. Top Mercado Livre

| Marketplace | Produto | Preço | Cenário atual | Novo cenário | Score | Motivos | Riscos | Copy segura |
|---|---|---:|---|---|---:|---|---|---|
| Mercado Livre | Relógio Masculino Chrowl Prateado Saint Germain Correia De Couro Marrom Caixa Prateada Fundo Branco 40mm Elegante Clássico | R$ 87,00 | organizacao_editorial | casa_organizada_antes_depois | 76.5 | preço na faixa preferencial; desconto informado de 65%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Relógio Masculino Chrowl Prateado Saint Germain Correia De Couro Marrom Caixa Prateada Fundo Branco 40mm Elegante Clássico · 💰 R$ 87,00 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Desconto informado de 65% · ✅ Categoria: De Pulso · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Teclado Gamer Magnético Akko Monsgeek Fun60 Pro 8000Hz Preto | R$ 210,00 | games_editorial | lazer_gamer_acessorio | 74.6 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | — | 🔥 Acessório gamer para curtir melhor · Teclado Gamer Magnético Akko Monsgeek Fun60 Pro 8000Hz Preto · 💰 R$ 210,00 · ✅ Acessório para complementar o lazer · ✅ Desconto informado de 46% · ✅ Categoria: Teclados Físicos · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Tênis Esportivo Masculino Delta Olympikus | R$ 129,99 | moda_editorial | look_sem_erro | 74.3 | preço na faixa preferencial; desconto informado de 43%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Tênis Esportivo Masculino Delta Olympikus · 💰 R$ 129,99 · ✅ Peça para compor o look do dia a dia · ✅ Desconto informado de 43% · ✅ Categoria: Tênis · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Caixa De Som Speaker Aiwa AWS-SP-01 Bluetooth Cor Preto | R$ 199,00 | tv_audio_editorial | audio_e_gadget_visual | 74.3 | preço na faixa preferencial; desconto informado de 43%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa De Som Speaker Aiwa AWS-SP-01 Bluetooth Cor Preto · 💰 R$ 199,00 · ✅ Gadget visual para usar no dia a dia · ✅ Desconto informado de 43% · ✅ Categoria: Caixas Bluetooth · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Varal Dobrável De Chão 3 Andares De Roupas Grande Com Rodinha Aba Lateral Retrátil Para Cabide Irsina | R$ 76,62 | organizacao_editorial | casa_organizada_antes_depois | 74.1 | preço na faixa preferencial; desconto informado de 41%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Varal Dobrável De Chão 3 Andares De Roupas Grande Com Rodinha Aba Lateral Retrátil Para Cabide Irsina · 💰 R$ 76,62 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Desconto informado de 41% · ✅ Categoria: Varais · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Secador Taiff Style 2000W Iônico Profissional Silencioso Preto.. | R$ 230,09 | beleza_editorial | autocuidado_que_resolve | 73.9 | preço na faixa preferencial; desconto informado de 39%; imagem disponível | — | 🔥 Achado prático para autocuidado · Secador Taiff Style 2000W Iônico Profissional Silencioso Preto.. · 💰 R$ 230,09 · ✅ Prático para a rotina de autocuidado · ✅ Desconto informado de 39% · ✅ Categoria: Kits de Artefatos · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Sapateira Dobrável de Plástico com 6 Prateleiras Para 12 Pares – Branco | R$ 125,55 | organizacao_editorial | casa_organizada_antes_depois | 73.7 | preço na faixa preferencial; desconto informado de 37%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Sapateira Dobrável de Plástico com 6 Prateleiras Para 12 Pares – Branco · 💰 R$ 125,55 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Desconto informado de 37% · ✅ Categoria: Sapateiras · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Jogo De Lençol 4 Peças King Padrão Fronha Ponto Palito 400 Fios Maciez E Conforto Prolongado Cor Azul Marinho | R$ 116,98 | games_editorial | lazer_gamer_acessorio | 73.1 | preço na faixa preferencial; desconto informado de 31%; imagem disponível | — | 🔥 Acessório gamer para curtir melhor · Jogo De Lençol 4 Peças King Padrão Fronha Ponto Palito 400 Fios Maciez E Conforto Prolongado Cor Azul Marinho · 💰 R$ 116,98 · ✅ Acessório para complementar o lazer · ✅ Desconto informado de 31% · ✅ Categoria: Lençóis · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Conjunto Bata Com Calça Jeans Trick Nick Bege | R$ 116,38 | moda_editorial | look_sem_erro | 73 | preço na faixa preferencial; desconto informado de 30%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Conjunto Bata Com Calça Jeans Trick Nick Bege · 💰 R$ 116,38 · ✅ Peça para compor o look do dia a dia · ✅ Desconto informado de 30% · ✅ Categoria: Calças · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Mercado Livre | Escova Secadora De Cabelos Britânia Bec07r Soft 4 Em 1 1300w Cor Rosa-claro | R$ 139,00 | beleza_editorial | autocuidado_que_resolve | 71.7 | preço na faixa preferencial; desconto informado de 17%; imagem disponível | — | 🔥 Achado prático para autocuidado · Escova Secadora De Cabelos Britânia Bec07r Soft 4 Em 1 1300w Cor Rosa-claro · 💰 R$ 139,00 · ✅ Prático para a rotina de autocuidado · ✅ Desconto informado de 17% · ✅ Categoria: Escovas Elétricas · ✅ Frete informado como grátis · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

## 16. Casos corrigidos

- Papel adesivo/decoração/sala/quarto/lavanderia → `casa_organizada_antes_depois`.
- Bermuda/gestante/modeladora/shorts/calça/legging/bota/tênis/sapato → `look_sem_erro` manual-first.
- Sensor de pneu/válvula/motocicleta/carro → `carro_pratico`.
- Câmera IP/sensor de movimento/segurança → risco `category_requires_manual`.

## 17. Rejeições e riscos

- Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum (Shopee): manual-first ou risco requer revisão
- Bota Tratorada Feminina Zíper Lateral Sola Alta Cano Baixo Coturno Blogueira Moda Confortável (Shopee): manual-first ou risco requer revisão
- Conjunto de Academia /Corrida Feminino Fitness Calça Legging Zero Transparência Cintura Alta (Shopee): manual-first ou risco requer revisão
- TENIS FEMININO CASUAL PLATAFORMA  ESTILOSO NA PROMOÇÃO (Shopee): manual-first ou risco requer revisão
- TENIS FEMININO CASUAL PLATAFORMA  ESTILOSO NA PROMOÇÃO (Shopee): manual-first ou risco requer revisão
- Tenis Masculino Escolar Academia Original FREEDOM Corrida Caminhada Lançamento PRETO e DOURADO (Shopee): manual-first ou risco requer revisão
- Bota Feminina Social Bico Fino Salto Médio Confortável Moda Blogueira Boho (Shopee): manual-first ou risco requer revisão
- Bota Feminina Social Bico Fino Salto Médio Cano Curto Médio Fivela Confortável Moda (Shopee): manual-first ou risco requer revisão
- Bota salto tratorado feminina casual elegante (Shopee): manual-first ou risco requer revisão
- Sapato Scarpin Confortavel Feminino Social Promocao (Shopee): manual-first ou risco requer revisão
- calça moletom de lã grossa unissex (envio imediato) (Shopee): manual-first ou risco requer revisão
- Tênis Feminino Esportivo Running Super Confortavel Linha Premium Envio Imediato (Shopee): manual-first ou risco requer revisão
- 6 kits Suporte Camera Celular Capacete Queixo e Smartphones - Ideal para Motociclismo e Aventur (Shopee): manual-first ou risco requer revisão
- BETTDOW Samsung Tab S9/S9 FE Lite 11 polegadas Teclado Bluetooth + Capa com Slot para Caneta (Tablet Não Incluso) (Shopee): manual-first ou risco requer revisão
- GameStick Retrô M15 PRO 4K 64GB Com 20 Mil Jogos Clássicos 2 Controles Sem Fio HDMI Plug Play Console Retro Gamer (Shopee): manual-first ou risco requer revisão
- Tênis Esportivo Masculino Delta Olympikus (Mercado Livre): manual-first ou risco requer revisão
- Conjunto Bata Com Calça Jeans Trick Nick Bege (Mercado Livre): manual-first ou risco requer revisão
- Calça Jeans Flare Country Feminina Lavagem Clara Média Escura (Shopee): marketplace, intenção ou risco bloqueante
- Tênis Masculino E Feminino Esportivo Proof 3 Olympikus (Mercado Livre): manual-first ou risco requer revisão
- Par Palmilha Paumilha Massagem 5D Feminina Antiimpacto Sapato Social Salto Anatômica Conforto Joanete Macia Sapatilha (Shopee): manual-first ou risco requer revisão
- Webcam com Microfone Full HD 1080p Giratória 360° Ajuste de Ângulo Livre para PC Notebook e Home Office (Shopee): manual-first ou risco requer revisão
- Câmera A8 Externa Ip A Prova D'água - Infravermelho Alarme Wifi Hd Sensor De Movimento - Bivolt (Shopee): manual-first ou risco requer revisão
- Câmera IP Knup Full HD 1080p Yoosee Externa Wi-Fi LB-CA244 Original (Shopee): manual-first ou risco requer revisão
- Kit Tapete Higiênico 10 até 100 unidades PetCharm Slim  -Tamanho 50cm x 60cm Para Cachorros (Shopee): manual-first ou risco requer revisão
- Câmera A8 Externa Ip A Prova D'água - Infravermelho Alarme Wifi Hd Sensor De Movimento Bivolt (Shopee): manual-first ou risco requer revisão
- Body Splash Inspirações Árabes e Importados Feminino JNY-100ml Perfume Corporal Longa Duração (Shopee): manual-first ou risco requer revisão
- Sapateira Organizador Sapato 9 Andares Vertical Portatil Preto (Mercado Livre): manual-first ou risco requer revisão
- Webcam EMEET C960 4K Streaming Live Autofoco Microfone Duplo 60fps PC Notebook Preto (Shopee): manual-first ou risco requer revisão
- MORDEDOR PARA CACHORRO PRODUTO NATURAL RUSTICO MADEIRA DE CAFE SABOR CÔCO DA HELPWOOD BRINQUEDO PET (Shopee): manual-first ou risco requer revisão
- Trena De 50 Metros Fita De Fibra De Vidro Aberta 30m 50m 100m X 14mm (Shopee): gate automático aprovado

## 18. Distribuição de score

- 20–29.9: 3
- 30–39.9: 13
- 40–49.9: 27
- 50–59.9: 86
- 60–69.9: 87
- 70–79.9: 65
- 80–89.9: 40
- Score exatamente 100: 0

## 19. Metadata preparada

Exemplo de metadata gerada, sem gravação:

```json
{
  "commercialCurationVersion": "commercial-curation/v1",
  "commercialIntent": "autocuidado_que_resolve",
  "achadinhoScore": 89.2,
  "commercialReasons": [
    "preço na faixa preferencial",
    "desconto informado de 88%",
    "imagem disponível",
    "link disponível",
    "aderência à intenção",
    "avaliação 4.8 disponível",
    "4.459 vendas informadas",
    "marketplace_metrics disponível",
    "baixa repetição"
  ],
  "commercialRiskFlags": [],
  "recommendedChannel": "panel_only",
  "copyVersion": "commercial-copy/v1",
  "suggestedCopy": "🔥 Achado prático para autocuidado\n\nDepilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil\n💰 R$ 18,33\n\n✅ Prático para a rotina de autocuidado\n✅ Avaliação 4.8\n✅ 4.459 vendas informadas\n✅ Desconto informado de 88%\n\n🔗 Ver oferta\n⚠️ Preço pode mudar a qualquer momento",
  "marketplaceFocus": "shopee",
  "isEligible": true,
  "manualReviewRequired": true,
  "automaticEligible": false,
  "manualReviewReason": "manual-first ou risco requer revisão",
  "sourceScenarioId": "beleza_editorial"
}
```

## 20. Testes executados

- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js` — 10 testes.
- `node --test scripts/__tests__/dry-run-commercial-matrix.test.cjs` — 3 testes.
- `node --check scripts/commercial-curation-v1.cjs`.
- `node --check scripts/dry-run-commercial-matrix.cjs`.

## 21. Read-only / no production changes

O script consulta somente `offers` e `discovery_items` via Supabase, e grava apenas estes relatórios Markdown locais. Não houve migration, update/insert/delete, publicação, Telegram, WhatsApp, Instagram/Facebook/Reels, cron, PM2 ou rollout Oracle.

## 22. Riscos restantes

- Ausência de conversão por intenção impede afirmar ganho de vendas.
- Famílias e taxonomia dependem dos títulos/categorias atuais.
- Mercado Livre continua exigindo revisão quando faltam sinais comerciais.

## 23. Próxima task recomendada

Adicionar painel shadow de drafts com a metadata V1 e telemetria de impressão/clique/conversão, sem ativar publicação automática.

## 24. Critério de sucesso

Copy limpa; score não saturado; classificações ambíguas corrigidas; top automático separado de manual-first. 321 produtos foram elegíveis nesta execução local.

