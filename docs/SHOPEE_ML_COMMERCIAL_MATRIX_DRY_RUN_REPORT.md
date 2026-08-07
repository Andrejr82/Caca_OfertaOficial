# Shopee + Mercado Livre — dry-run da matriz comercial

Referência: 07/08/2026 09:01 BRT. Script executado em modo read-only contra Supabase; não houve publicação, mensageria, cron, Oracle, PM2 ou escrita no banco.

## Resumo executivo

Foram encontrados **444 produtos únicos com preço** nas últimas 48h. A conclusão considera disponibilidade de candidatos, não conversão: a telemetria de clique/venda não foi usada como prova de performance.

## Janelas analisadas

- Hoje desde 06h BRT: 46 produtos.
- Últimas 24h: 239 produtos.
- Últimas 48h: 444 produtos.

## Volume analisado

- Ofertas: 298; discovery items: 554; deduplicados com preço: 444.
- Por marketplace: Shopee 303; Mercado Livre 141.

## Volume por matriz atual

- grandes_ofertas_editorial: 111
- beleza_editorial: 54
- games_editorial: 45
- moda_editorial: 41
- casa_cozinha_editorial: 38
- tv_audio_editorial: 28
- organizacao_editorial: 26
- celulares_editorial: 22
- esporte_editorial: 21
- pet_editorial: 19
- ferramentas_editorial: 17
- informatica_editorial: 16
- eletrodomesticos_editorial: 4
- moveis_editorial: 2

## Volume por nova intenção comercial

- oferta_real_do_dia: 96
- look_sem_erro: 55
- autocuidado_que_resolve: 53
- casa_organizada_antes_depois: 50
- lazer_gamer_acessorio: 45
- audio_e_gadget_visual: 28
- tech_de_bolso: 23
- pet_recorrente_e_util: 21
- upgrade_trabalho_estudo: 19
- utilidade_casa_essencial: 19
- faca_voce_mesmo_leve: 16
- eletro_validado_para_casa: 10
- casa_escritorio_comparado: 8
- carro_pratico: 1

## Top produtos por nova matriz

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
| Shopee | Varal De Chão 3 Andares Roupa Calcinha Dobrável Grade Reforçado com 4 Rodas Portátil e Compacto | R$ 79,80 | organizacao_editorial | casa_organizada_antes_depois | 87.1 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Varal De Chão 3 Andares Roupa Calcinha Dobrável Grade Reforçado com 4 Rodas Portátil e Compacto · 💰 R$ 79,80 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.9 · ✅ 7.102 vendas informadas · ✅ Desconto informado de 46% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Mop Spray Com Reservatório Esfregão Vassoura Mágica | R$ 37,99 | organizacao_editorial | casa_organizada_antes_depois | 86.9 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | — | 🔥 Organização simples que ajuda de verdade · Mop Spray Com Reservatório Esfregão Vassoura Mágica · 💰 R$ 37,99 · ✅ Ajuda a aproveitar melhor o espaço · ✅ Avaliação 4.7 · ✅ 4.831 vendas informadas · ✅ Desconto informado de 46% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Caixa de Som Bluetooth Externo Prova D'Água IPX5 - TWS Multimídia TWS USB TF FM AUX | R$ 49,96 | tv_audio_editorial | audio_e_gadget_visual | 86.8 | preço na faixa preferencial; desconto informado de 55%; imagem disponível | — | 🔥 Gadget visual com preço interessante · Caixa de Som Bluetooth Externo Prova D'Água IPX5 - TWS Multimídia TWS USB TF FM AUX · 💰 R$ 49,96 · ✅ Gadget visual para usar no dia a dia · ✅ Avaliação 4.8 · ✅ 1.286 vendas informadas · ✅ Desconto informado de 55% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Kit Sobrancelha Henna makiaj+Palito+Navalha+Paquímetro+Tesoura+Pincel+Dappen+Lápis Dermatografico | R$ 34,98 | beleza_editorial | autocuidado_que_resolve | 86.4 | preço na faixa preferencial; desconto informado de 55%; imagem disponível | — | 🔥 Achado prático para autocuidado · Kit Sobrancelha Henna makiaj+Palito+Navalha+Paquímetro+Tesoura+Pincel+Dappen+Lápis Dermatografico · 💰 R$ 34,98 · ✅ Prático para a rotina de autocuidado · ✅ Avaliação 4.9 · ✅ 810 vendas informadas · ✅ Desconto informado de 55% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |
| Shopee | Conjunto de Academia /Corrida Feminino Fitness Calça Legging Zero Transparência Cintura Alta | R$ 53,99 | moda_editorial | look_sem_erro | 86.1 | preço na faixa preferencial; desconto informado de 46%; imagem disponível | fashion_size_complexity | 🔥 Achado para compor o look · Conjunto de Academia /Corrida Feminino Fitness Calça Legging Zero Transparência Cintura Alta · 💰 R$ 53,99 · ✅ Peça para compor o look do dia a dia · ✅ Avaliação 4.8 · ✅ 1.761 vendas informadas · ✅ Desconto informado de 46% · 🔗 Ver oferta · ⚠️ Preço pode mudar a qualquer momento |

## Melhores produtos Shopee

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

## Melhores produtos Mercado Livre

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

## Comparação matriz atual vs nova matriz

A matriz atual agrupa por departamento; a nova privilegia intenção e sinais verificáveis. O score não prova que um candidato converterá melhor: faltam dados de clique/venda suficientes para essa afirmação causal. Ela melhora a triagem por preço, evidência disponível, imagem, link e repetição.

## Exemplos de copy segura

### Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil (Shopee)

```text
🔥 Achado prático para autocuidado

Depilador de Sombrancelha Buço Nariz Orelha Rosto Facial Elétrico Tira Pelos USB Recarregável Profissional Portátil
💰 R$ 18,33

✅ Prático para a rotina de autocuidado
✅ Avaliação 4.8
✅ 4.459 vendas informadas
✅ Desconto informado de 88%

🔗 Ver oferta
⚠️ Preço pode mudar a qualquer momento
```

### Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos (Shopee)

```text
🔥 Achado prático para autocuidado

Depilador Elétrico Feminino Recarregável, Navalha Dupla - Removedor de Pelos
💰 R$ 27,49

✅ Prático para a rotina de autocuidado
✅ Avaliação 4.7
✅ 3.077 vendas informadas
✅ Desconto informado de 77%

🔗 Ver oferta
⚠️ Preço pode mudar a qualquer momento
```

### Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum (Shopee)

```text
🔥 Achado para compor o look

Calça Mom Jeans Cintura Alta Feminina Levanta Bumbum
💰 R$ 69,90

✅ Peça para compor o look do dia a dia
✅ Avaliação 4.8
✅ 9.396 vendas informadas
✅ Desconto informado de 59%

🔗 Ver oferta
⚠️ Preço pode mudar a qualquer momento
```

### Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia (Shopee)

```text
🔥 Organização simples que ajuda de verdade

Papel Adesivo Linho Marrom Claro para Decoração, Sala, Quarto, Lavanderia
💰 R$ 17,99

✅ Ajuda a aproveitar melhor o espaço
✅ Avaliação 4.8
✅ 2.341 vendas informadas
✅ Desconto informado de 70%

🔗 Ver oferta
⚠️ Preço pode mudar a qualquer momento
```

## Produtos rejeitados e motivos

- KIT4 Câmera De Segurança Externa Lente V3 Dupla ComSirene 4G 6mp Full Hd 4K 360graus  Visão Noturna (Shopee): category_requires_manual; security_camera_manual; marketplace_metrics_missing
- Câmera A8 Externa Ip A Prova D'água com Infravermelho Alarme Wifi Hd Sensor De Movimento Bivolt app icsee ou V380 (Shopee): category_requires_manual; security_camera_manual; marketplace_metrics_missing
- Notebook Gamer 15,6 Polegadas Intel N5095 (2025) - 16GB RAM + 512GB SSD, Live Streaming, Leve e Rápido (Shopee): category_requires_manual; high_ticket_requires_manual; electronics_high_ticket_manual
- Cadeira Gamer Premium Escritório Giratória 360º Reclinável Apoio Para Pés E Encosto Ajustável Couro (Shopee): large_furniture_manual; large_or_freight_sensitive_manual; marketplace_metrics_missing
- Python Fly Cadeira Gamer Estilo Futebol Com Apoio Lombar E Cabeça (Mercado Livre): high_ticket_requires_manual; large_furniture_manual; large_or_freight_sensitive_manual
- Celular Smartphone Xiaomi Poco C71 Dual Sim Versão Global (COM CAPINHA E PELÍCULA) (Shopee): high_ticket_requires_manual; electronics_high_ticket_manual; marketplace_metrics_missing
- Smartphone Xiaomi Redmi 15c 256gb / 128gb Global Original (COM CAPINHA E PELÍCULA DE CORTESIA) (Shopee): high_ticket_requires_manual; electronics_high_ticket_manual; marketplace_metrics_missing
- Smartphone Xiaomi Poco C85 256GB / 128GB Versão Global NFC Envio Imediato (COM PELÍCULA DE CORTESIA) (Shopee): high_ticket_requires_manual; electronics_high_ticket_manual; marketplace_metrics_missing
- Celular Smartphone Xiaomi Poco X8 Pro 5G 256GB / 512GB Versão Global Original Lacrado Envio Imediato (Shopee): high_ticket_requires_manual; electronics_high_ticket_manual; marketplace_metrics_missing
- Smartphone Realme Note 60X Dual Sim Versão Global (COM CAPINHA E PELÍCULA) (Shopee): high_ticket_requires_manual; electronics_high_ticket_manual; marketplace_metrics_missing
- Creatina Pote 100g Max Titanium (Shopee): category_requires_manual; regulated_or_sensitive; marketplace_metrics_missing
- Câmera IP Knup Full HD 1080p Yoosee Externa Wi-Fi LB-CA244 Original (Shopee): category_requires_manual; security_camera_manual; marketplace_metrics_missing
- Câmera Wifi IP Externa Yoosee 1080p Full HD IP66 À Prova D’água Visão Noturna Segurança Residencial Comércio (Shopee): category_requires_manual; security_camera_manual; marketplace_metrics_missing
- Guarda Roupa Grande Dobrável Armário Arara Organizador Multiuso Roupeiro Cabideiro Sapateira Casa (Shopee): category_requires_manual; large_furniture_manual; large_or_freight_sensitive_manual; marketplace_metrics_missing
- Base Líquida Matte Oil Free Vegana Adversa - Escolha Seu Tom (Shopee): weak_commercial_intent; marketplace_metrics_missing
- Sapateira Funcional para Até 20 Pares com Design Compacto Móveis Bonatto (Shopee): weak_commercial_intent; marketplace_metrics_missing
- Rack Bancada com pés 1.20 Life e Vegas 0.90 com 2 Portas Moderno Parede TV Até 50Pol - LANÇAMENTO (Shopee): weak_commercial_intent; marketplace_metrics_missing
- Rack Bancada Moderno com Nichos Sala Aparador Com Pés Retro Zahra  - Várias Cores (Shopee): weak_commercial_intent; marketplace_metrics_missing
- Whey Concentrado 80% Whey Protein - Growth Supplements Sabor Banana (Mercado Livre): weak_commercial_intent; regulated_or_sensitive
- Protein Fusion Whey Isolate 900g - Espartanos (Shopee): weak_commercial_intent; marketplace_metrics_missing

## Dados ausentes por marketplace

- Shopee: sinais dependem de `marketplace_metrics`/payload; nem todos os produtos trazem rating, vendas, desconto, tipo de loja ou comissão.
- Mercado Livre: este dry-run não usa rating, reviews, vendas, “mais vendido”, loja oficial, frete grátis ou cupom sem um campo runtime comprovado. Onde faltam preço/categoria/vendedor/frete, a copy permanece genérica e conservadora.

## Riscos

- Janela curta pode não representar sazonalidade ou estoque.
- Score é hipótese de priorização e não substitui experimento com tracking de clique/conversão.
- Link em `offers.original_url` pode não ser um link afiliado validado; o relatório o trata somente como “link disponível”.

## Conclusão

**AJUSTAR E IMPLEMENTAR EM EXPERIMENTO CONTROLADO** — há 444 candidatos em 48h. Implementar apenas após definir gates mínimos por intenção e capturar métricas de clique/conversão; não alterar a matriz ativa com base somente neste dry-run.

## Próxima task recomendada

Adicionar telemetria read-only/observável por intenção (impressão, clique, conversão e comissão) e rodar um experimento shadow de sete dias antes de mudar o roteamento oficial.

