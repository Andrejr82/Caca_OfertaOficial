# Tendências IA — Status de Implementação

## Meta
Radar diário de tendências reais nos 7 nichos oficiais, com evidência temporal/nativa de Amazon, Mercado Livre e Shopee, Trend Score separado do Commercial Score e sem preenchimento artificial.

## Task 1 — Implementação do repositório
Status: PASS

- 7 nichos como fronteira do Radar;
- Trend Evidence Gate;
- Trend Score separado do Commercial Score;
- Shopee restrita às categorias canônicas;
- recência observacional (produto recente gera histórico, não exclusão);
- ML Trends por categoria + fallback global + Highlights;
- Amazon Best Sellers + histórico de rank;
- rank de busca Amazon não é aceito como rank de tendência;
- schema Supabase compatível: verified/partial + trend_score;
- UI por nicho, somente trending_flag=true no contrato novo;
- feedback explícito para monetization_required e handoff concluído;
- zero publicação automática.

## Task 2 — Testes determinísticos e dry-runs
Status: PASS

- 46/46 testes determinísticos PASS;
- Shopee: 7/7 nichos com aceleração factual simulada;
- Mercado Livre: 7/7 nichos com trend nativo + best seller;
- Amazon: 7/7 nichos com subida factual de Best Sellers rank;
- cenário negativo: 0 tendências;
- max snapshot <= 20;
- publishCalls=0;
- postsWrites=0;
- offersWrites=0.

## Task 3 — Amostras reais
Status: PASS

- Mercado Livre: sinais nativos atuais validados para os nichos;
- Shopee: volume/ranking atuais tratados como observação inicial até existir delta temporal;
- Amazon: ausência de leitura live no ambiente é tratada como fonte indisponível, sem fabricar tendência;
- distinção explícita entre tendência comprovada, sem evidência suficiente e fonte indisponível.

## Task 4 — Preview factual
Status: PASS

- painel previsto mostra somente tendências com evidência;
- nichos sem evidência suficiente permanecem vazios;
- nenhum preenchimento artificial para atingir Top 20.

## Task 5 — Gate pré-promoção
Status: PASS

- persistência histórica mantém tendências `verified` e observações `partial`;
- UI filtra observações e mostra apenas `trending_flag=true`;
- confirmação multimarketplace exige evidência forte;
- fallback global do ML Trends preservado;
- 46/46 testes PASS + dry-run PASS;
- nenhuma alteração Oracle;
- nenhuma publicação manual.

## Task 6A — Promoção controlada
Status: EM ANDAMENTO

Objetivo: consolidar o pacote em um único commit/PR para `main`, com o mínimo possível de eventos de deploy Vercel.

## Task 6B — Rollout Oracle
Status: PENDENTE

Somente após `main` aprovado. Rollout separado e controlado apenas de `oracle-trends-radar`, sem tocar em `oracle-scraper`, cron editorial ou ciclos.
