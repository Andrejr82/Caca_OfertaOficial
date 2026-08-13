-- T31: Plano de índices e consultas V1 Shopee (IMPLANTACAO_MOTOR_BUSCA_SHOPEE_V1.md sec 10.4)
-- Adoção de persistência via JSONB `explainability` na T30.

create unique index if not exists offers_shopee_identity_uq
on public.offers (user_id, shopee_shop_id, shopee_item_id)
where platform = 'Shopee' and shopee_shop_id is not null and shopee_item_id is not null;

create index if not exists offers_shopee_strategy_score_idx
on public.offers (user_id, (explainability->>'strategy_version'), score desc, created_at desc)
where platform = 'Shopee';
