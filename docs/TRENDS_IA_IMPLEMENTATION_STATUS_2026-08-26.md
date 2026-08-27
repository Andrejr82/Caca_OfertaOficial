# Tendências IA — Status de Implementação

## Meta
Radar diário de tendências reais nos 7 nichos oficiais, com evidência temporal/nativa de Amazon, Mercado Livre e Shopee, Trend Score separado do Commercial Score e sem preenchimento artificial.

## Task 1 — Implementação do repositório
Status: PASS

Implementado localmente, sem deploy/push/Oracle:
- 7 nichos como fronteira do Radar;
- Trend Evidence Gate;
- Trend Score separado do Commercial Score;
- Shopee restrita às categorias canônicas;
- recência observacional (produto recente gera histórico, não exclusão);
- ML Trends por categoria + Highlights;
- Amazon Best Sellers + histórico de rank;
- rank de busca Amazon não é aceito como rank de tendência;
- schema Supabase compatível: verified/partial + trend_score;
- UI por nicho, somente trending_flag=true no contrato novo;
- feedback para monetization_required e sucesso visível após handoff;
- zero publicação automática.

Gate: 45/45 testes PASS; node --check PASS; TypeScript parse/local contracts PASS.

## Task 2 — Testes determinísticos e dry-runs
Status: PASS

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

- Mercado Livre: sinais nativos atuais compatíveis com os nichos oficiais foram confirmados em trends/highlights;
- Shopee: volumes/rankings atuais servem como observação inicial; tendência exige delta temporal em snapshot posterior;
- Amazon: Sales Rank é a evidência autoritativa, mas sem leitura factual live no ambiente usado a fonte deve ser marcada como indisponível, nunca inferida;
- Supabase atual confirma o problema legado: snapshots concluídos com 0 trending_flag, 0 trend_score e velocidade insuficiente.

## Task 4 — Preview factual
Status: PASS

- o painel deve mostrar somente tendências comprovadas;
- nichos sem evidência suficiente mostram estado vazio factual;
- não há preenchimento artificial para completar 20 cards;
- Trend Score e Commercial Score permanecem separados.

## Task 5 — Consolidação e gate de promoção
Status: IN_PROGRESS

Objetivos:
- consolidar o diff funcional em um único pacote;
- repetir suíte final e dry-run;
- revisar wiring do worker, persistência e UI;
- não mover main nem branch conectada à Vercel antes de aprovação explícita;
- não tocar na Oracle.

## Restrições operacionais
- nenhum deploy Vercel durante desenvolvimento intermediário;
- nenhum push intermediário em branch ligada à Vercel;
- nenhuma alteração Oracle nesta fase;
- nenhum ciclo/publicação manual.
