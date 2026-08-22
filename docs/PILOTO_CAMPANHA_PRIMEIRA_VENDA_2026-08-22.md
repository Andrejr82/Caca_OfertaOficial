# Piloto da campanha — primeira venda — 2026-08-22

## Oferta real escolhida

- Origem: Trends IA
- Radar product: `898bbef8-ff54-413d-a328-91a3372c75eb`
- Radar run: `b0a45f3c-ec1f-471b-ad9d-31670569a035`
- Offer: `923117b0-5111-45fb-9514-21dcd776f7f3`
- Produto: Papa Bolinhas Elétrico Tira Pelos de Roupas Removedor Aparador Sem Fio Recarregável
- Marketplace: Shopee
- Preço atual observado: R$ 25,96
- Link atual da oferta: `https://s.shopee.com.br/W5DOZ1T7b`
- Evidência do Radar: 8.469 vendas, rating 4,8, desconto observado de 64%, comissão efetiva observada de 10% e estimativa de R$ 2,40 por venda na coleta do Radar.

## Estado antes do piloto

- `selected_offer_id` já materializado para a oferta acima.
- Ainda não existe `video_job` para esta oferta.
- Ainda não existe campanha em `offer_campaigns`.
- Nenhuma publicação automática deve ocorrer.

## Gate antes do único deploy

Executar em checkout do commit final:

```bash
npm run verify
```

O deploy só deve seguir com lint, typecheck, testes, build e security check concluídos sem erro.

## Fluxo do piloto

1. Fazer o único deploy final da aplicação.
2. Em Vídeos de Ofertas, selecionar a oferta acima.
3. Usar o prompt Gemini atual sem alteração.
4. Gerar/importar/aprovar um vídeo.
5. Clicar em **Iniciar campanha desta oferta**.
6. Abrir a campanha e confirmar janela de 48h e checklist dos 5 canais.
7. Gerar no programa oficial da Shopee os links com os Sub_ids sugeridos e salvá-los na campanha.
8. Distribuir a mesma oferta em Instagram Reel, Instagram Stories, Facebook Feed, Facebook Groups compatíveis e WhatsApp.
9. Marcar cada execução no checklist.
10. Acompanhar por 24–48h: cliques com evidência interna quando houver; demais cliques e vendas via relatório oficial da Shopee; pedidos e comissão apenas por `source_sub_id` ou `affiliate_link_id` exatos da campanha.
11. Importar o relatório oficial quando disponível e revisar pedidos/comissão atribuídos.
12. Só então decidir repetir, mudar distribuição ou trocar a oferta.

## Critérios de aceite

- Segundo clique em iniciar campanha reutiliza a campanha aberta, sem duplicar.
- Checklist registra os cinco placements.
- Links oficiais permanecem separados por placement.
- Venda sem evidência da campanha não é atribuída.
- Facebook permanece canal canônico de vendas.
- Métrica desconhecida aparece como desconhecida/aguardando relatório, nunca como clique inventado.
- Nenhuma alteração em Trends, prompt Gemini ou `video-worker`.
