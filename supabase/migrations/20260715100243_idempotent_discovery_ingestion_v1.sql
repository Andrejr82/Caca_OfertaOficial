-- Persistência idempotente da Discovery V5.
-- Esta migration replica a definição validada no banco Supabase real.

CREATE UNIQUE INDEX IF NOT EXISTS offers_ml_native_item_unique
ON public.offers (user_id, platform, item_id)
WHERE platform = 'Mercado Livre'
  AND item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_ml_native_product_unique
ON public.offers (user_id, platform, product_id)
WHERE platform = 'Mercado Livre'
  AND product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_amazon_native_product_unique
ON public.offers (user_id, platform, product_id)
WHERE platform = 'Amazon'
  AND product_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_discovery_offers_v1(
  p_marketplace text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_row jsonb;
  v_received integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_ignored integer := 0;
  v_failed integer := 0;

  v_user_id uuid;
  v_item_id text;
  v_product_id text;
  v_shopee_item_id text;
  v_existing_id uuid;
  v_existing_item_id uuid;
  v_existing_product_id uuid;
  v_was_existing boolean;
  v_lock_a bigint;
  v_lock_b bigint;
BEGIN
  IF p_marketplace NOT IN ('Shopee', 'Mercado Livre', 'Amazon') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Marketplace inválido';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_rows deve ser um array JSON';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_received := v_received + 1;

    IF COALESCE(v_row->>'platform', '') <> p_marketplace THEN
      v_failed := v_failed + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_user_id := NULLIF(v_row->>'user_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_failed := v_failed + 1;
      CONTINUE;
    END;

    IF v_user_id IS NULL
       OR NULLIF(v_row->>'product_name', '') IS NULL
       OR NULLIF(v_row->>'original_url', '') IS NULL
       OR NULLIF(v_row->>'current_price', '') IS NULL THEN
      v_failed := v_failed + 1;
      CONTINUE;
    END IF;

    IF p_marketplace = 'Shopee' THEN
      v_shopee_item_id := NULLIF(v_row->>'shopee_item_id', '');
      IF v_shopee_item_id IS NULL THEN
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      PERFORM pg_advisory_xact_lock(
        hashtextextended(v_user_id::text || '|Shopee|' || v_shopee_item_id, 0)
      );

      SELECT EXISTS (
        SELECT 1
        FROM public.offers
        WHERE user_id = v_user_id
          AND platform = 'Shopee'
          AND shopee_item_id = v_shopee_item_id
      ) INTO v_was_existing;

      INSERT INTO public.offers (
        user_id, platform, product_name, category, original_url, image_url,
        current_price, old_price, score, status, explainability, notes,
        shopee_item_id, shopee_shop_id, shopee_product_cat_id,
        native_category_order, native_category_position, updated_at
      ) VALUES (
        v_user_id,
        'Shopee',
        v_row->>'product_name',
        NULLIF(v_row->>'category', ''),
        v_row->>'original_url',
        NULLIF(v_row->>'image_url', ''),
        (v_row->>'current_price')::numeric,
        NULLIF(v_row->>'old_price', '')::numeric,
        COALESCE(NULLIF(v_row->>'score', '')::numeric, 0),
        'pending_manual_review',
        COALESCE(v_row->'explainability', '{}'::jsonb),
        NULLIF(v_row->>'notes', ''),
        v_shopee_item_id,
        NULLIF(v_row->>'shopee_shop_id', ''),
        NULLIF(v_row->>'shopee_product_cat_id', ''),
        NULLIF(v_row->>'native_category_order', '')::integer,
        NULLIF(v_row->>'native_category_position', '')::integer,
        NOW()
      )
      ON CONFLICT (user_id, platform, shopee_item_id)
      WHERE platform = 'Shopee' AND shopee_item_id IS NOT NULL
      DO UPDATE SET
        product_name = EXCLUDED.product_name,
        category = COALESCE(EXCLUDED.category, public.offers.category),
        original_url = EXCLUDED.original_url,
        image_url = COALESCE(EXCLUDED.image_url, public.offers.image_url),
        current_price = EXCLUDED.current_price,
        old_price = COALESCE(EXCLUDED.old_price, public.offers.old_price),
        score = EXCLUDED.score,
        explainability = COALESCE(EXCLUDED.explainability, public.offers.explainability),
        notes = COALESCE(EXCLUDED.notes, public.offers.notes),
        shopee_shop_id = COALESCE(EXCLUDED.shopee_shop_id, public.offers.shopee_shop_id),
        shopee_product_cat_id = COALESCE(EXCLUDED.shopee_product_cat_id, public.offers.shopee_product_cat_id),
        native_category_order = COALESCE(EXCLUDED.native_category_order, public.offers.native_category_order),
        native_category_position = COALESCE(EXCLUDED.native_category_position, public.offers.native_category_position),
        updated_at = NOW();

      IF v_was_existing THEN
        v_updated := v_updated + 1;
      ELSE
        v_inserted := v_inserted + 1;
      END IF;

    ELSIF p_marketplace = 'Mercado Livre' THEN
      v_item_id := NULLIF(v_row->>'item_id', '');
      v_product_id := NULLIF(v_row->>'product_id', '');

      IF v_item_id IS NULL AND v_product_id IS NULL THEN
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      v_lock_a := hashtextextended(v_user_id::text || '|Mercado Livre|item|' || COALESCE(v_item_id, ''), 0);
      v_lock_b := hashtextextended(v_user_id::text || '|Mercado Livre|product|' || COALESCE(v_product_id, ''), 0);

      IF v_lock_a <= v_lock_b THEN
        PERFORM pg_advisory_xact_lock(v_lock_a);
        PERFORM pg_advisory_xact_lock(v_lock_b);
      ELSE
        PERFORM pg_advisory_xact_lock(v_lock_b);
        PERFORM pg_advisory_xact_lock(v_lock_a);
      END IF;

      v_existing_item_id := NULL;
      v_existing_product_id := NULL;

      IF v_item_id IS NOT NULL THEN
        SELECT id INTO v_existing_item_id
        FROM public.offers
        WHERE user_id = v_user_id
          AND platform = 'Mercado Livre'
          AND item_id = v_item_id
        LIMIT 1;
      END IF;

      IF v_product_id IS NOT NULL THEN
        SELECT id INTO v_existing_product_id
        FROM public.offers
        WHERE user_id = v_user_id
          AND platform = 'Mercado Livre'
          AND product_id = v_product_id
        LIMIT 1;
      END IF;

      IF v_existing_item_id IS NOT NULL
         AND v_existing_product_id IS NOT NULL
         AND v_existing_item_id <> v_existing_product_id THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Conflito de identidade Mercado Livre';
      END IF;

      v_existing_id := COALESCE(v_existing_item_id, v_existing_product_id);

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.offers SET
          product_name = v_row->>'product_name',
          category = COALESCE(NULLIF(v_row->>'category', ''), category),
          original_url = v_row->>'original_url',
          image_url = COALESCE(NULLIF(v_row->>'image_url', ''), image_url),
          current_price = (v_row->>'current_price')::numeric,
          old_price = COALESCE(NULLIF(v_row->>'old_price', '')::numeric, old_price),
          score = COALESCE(NULLIF(v_row->>'score', '')::numeric, score),
          explainability = COALESCE(v_row->'explainability', explainability),
          notes = COALESCE(NULLIF(v_row->>'notes', ''), notes),
          item_id = COALESCE(v_item_id, item_id),
          product_id = COALESCE(v_product_id, product_id),
          category_id = COALESCE(NULLIF(v_row->>'category_id', ''), category_id),
          category_name = COALESCE(NULLIF(v_row->>'category_name', ''), category_name),
          source_position = COALESCE(NULLIF(v_row->>'source_position', '')::integer, source_position),
          seller_id = COALESCE(NULLIF(v_row->>'seller_id', ''), seller_id),
          seller_name = COALESCE(NULLIF(v_row->>'seller_name', ''), seller_name),
          shipping_free = COALESCE(NULLIF(v_row->>'shipping_free', '')::boolean, shipping_free),
          source_categories = COALESCE(v_row->'source_categories', source_categories),
          updated_at = NOW()
        WHERE id = v_existing_id;
        v_updated := v_updated + 1;
      ELSE
        IF v_item_id IS NOT NULL THEN
          INSERT INTO public.offers (
            user_id, platform, product_name, category, original_url, image_url,
            current_price, old_price, score, status, explainability, notes,
            item_id, product_id, category_id, category_name, source_position,
            seller_id, seller_name, shipping_free, source_categories, updated_at
          ) VALUES (
            v_user_id, 'Mercado Livre', v_row->>'product_name', NULLIF(v_row->>'category', ''),
            v_row->>'original_url', NULLIF(v_row->>'image_url', ''),
            (v_row->>'current_price')::numeric, NULLIF(v_row->>'old_price', '')::numeric,
            COALESCE(NULLIF(v_row->>'score', '')::numeric, 0), 'pending_manual_review',
            COALESCE(v_row->'explainability', '{}'::jsonb), NULLIF(v_row->>'notes', ''),
            v_item_id, v_product_id, NULLIF(v_row->>'category_id', ''),
            NULLIF(v_row->>'category_name', ''), NULLIF(v_row->>'source_position', '')::integer,
            NULLIF(v_row->>'seller_id', ''), NULLIF(v_row->>'seller_name', ''),
            NULLIF(v_row->>'shipping_free', '')::boolean,
            COALESCE(v_row->'source_categories', '[]'::jsonb), NOW()
          )
          ON CONFLICT (user_id, platform, item_id)
          WHERE platform = 'Mercado Livre' AND item_id IS NOT NULL
          DO UPDATE SET
            product_name = EXCLUDED.product_name,
            category = COALESCE(EXCLUDED.category, public.offers.category),
            original_url = EXCLUDED.original_url,
            image_url = COALESCE(EXCLUDED.image_url, public.offers.image_url),
            current_price = EXCLUDED.current_price,
            old_price = COALESCE(EXCLUDED.old_price, public.offers.old_price),
            score = EXCLUDED.score,
            explainability = COALESCE(EXCLUDED.explainability, public.offers.explainability),
            notes = COALESCE(EXCLUDED.notes, public.offers.notes),
            product_id = COALESCE(EXCLUDED.product_id, public.offers.product_id),
            category_id = COALESCE(EXCLUDED.category_id, public.offers.category_id),
            category_name = COALESCE(EXCLUDED.category_name, public.offers.category_name),
            source_position = COALESCE(EXCLUDED.source_position, public.offers.source_position),
            seller_id = COALESCE(EXCLUDED.seller_id, public.offers.seller_id),
            seller_name = COALESCE(EXCLUDED.seller_name, public.offers.seller_name),
            shipping_free = COALESCE(EXCLUDED.shipping_free, public.offers.shipping_free),
            source_categories = COALESCE(EXCLUDED.source_categories, public.offers.source_categories),
            updated_at = NOW();
        ELSE
          INSERT INTO public.offers (
            user_id, platform, product_name, category, original_url, image_url,
            current_price, old_price, score, status, explainability, notes,
            product_id, category_id, category_name, source_position,
            seller_id, seller_name, shipping_free, source_categories, updated_at
          ) VALUES (
            v_user_id, 'Mercado Livre', v_row->>'product_name', NULLIF(v_row->>'category', ''),
            v_row->>'original_url', NULLIF(v_row->>'image_url', ''),
            (v_row->>'current_price')::numeric, NULLIF(v_row->>'old_price', '')::numeric,
            COALESCE(NULLIF(v_row->>'score', '')::numeric, 0), 'pending_manual_review',
            COALESCE(v_row->'explainability', '{}'::jsonb), NULLIF(v_row->>'notes', ''),
            v_product_id, NULLIF(v_row->>'category_id', ''),
            NULLIF(v_row->>'category_name', ''), NULLIF(v_row->>'source_position', '')::integer,
            NULLIF(v_row->>'seller_id', ''), NULLIF(v_row->>'seller_name', ''),
            NULLIF(v_row->>'shipping_free', '')::boolean,
            COALESCE(v_row->'source_categories', '[]'::jsonb), NOW()
          )
          ON CONFLICT (user_id, platform, product_id)
          WHERE platform = 'Mercado Livre' AND product_id IS NOT NULL
          DO UPDATE SET
            product_name = EXCLUDED.product_name,
            category = COALESCE(EXCLUDED.category, public.offers.category),
            original_url = EXCLUDED.original_url,
            image_url = COALESCE(EXCLUDED.image_url, public.offers.image_url),
            current_price = EXCLUDED.current_price,
            old_price = COALESCE(EXCLUDED.old_price, public.offers.old_price),
            score = EXCLUDED.score,
            explainability = COALESCE(EXCLUDED.explainability, public.offers.explainability),
            notes = COALESCE(EXCLUDED.notes, public.offers.notes),
            category_id = COALESCE(EXCLUDED.category_id, public.offers.category_id),
            category_name = COALESCE(EXCLUDED.category_name, public.offers.category_name),
            source_position = COALESCE(EXCLUDED.source_position, public.offers.source_position),
            seller_id = COALESCE(EXCLUDED.seller_id, public.offers.seller_id),
            seller_name = COALESCE(EXCLUDED.seller_name, public.offers.seller_name),
            shipping_free = COALESCE(EXCLUDED.shipping_free, public.offers.shipping_free),
            source_categories = COALESCE(EXCLUDED.source_categories, public.offers.source_categories),
            updated_at = NOW();
        END IF;
        v_inserted := v_inserted + 1;
      END IF;

    ELSE
      v_product_id := NULLIF(v_row->>'product_id', '');
      IF v_product_id IS NULL THEN
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      PERFORM pg_advisory_xact_lock(
        hashtextextended(v_user_id::text || '|Amazon|' || v_product_id, 0)
      );

      SELECT EXISTS (
        SELECT 1
        FROM public.offers
        WHERE user_id = v_user_id
          AND platform = 'Amazon'
          AND product_id = v_product_id
      ) INTO v_was_existing;

      INSERT INTO public.offers (
        user_id, platform, product_name, category, original_url, image_url,
        current_price, old_price, score, status, explainability, notes,
        product_id, source_position, updated_at
      ) VALUES (
        v_user_id, 'Amazon', v_row->>'product_name', NULLIF(v_row->>'category', ''),
        v_row->>'original_url', NULLIF(v_row->>'image_url', ''),
        (v_row->>'current_price')::numeric, NULLIF(v_row->>'old_price', '')::numeric,
        COALESCE(NULLIF(v_row->>'score', '')::numeric, 0), 'pending_manual_review',
        COALESCE(v_row->'explainability', '{}'::jsonb), NULLIF(v_row->>'notes', ''),
        v_product_id, NULLIF(v_row->>'source_position', '')::integer, NOW()
      )
      ON CONFLICT (user_id, platform, product_id)
      WHERE platform = 'Amazon' AND product_id IS NOT NULL
      DO UPDATE SET
        product_name = EXCLUDED.product_name,
        category = COALESCE(EXCLUDED.category, public.offers.category),
        original_url = EXCLUDED.original_url,
        image_url = COALESCE(EXCLUDED.image_url, public.offers.image_url),
        current_price = EXCLUDED.current_price,
        old_price = COALESCE(EXCLUDED.old_price, public.offers.old_price),
        score = EXCLUDED.score,
        explainability = COALESCE(EXCLUDED.explainability, public.offers.explainability),
        notes = COALESCE(EXCLUDED.notes, public.offers.notes),
        source_position = COALESCE(EXCLUDED.source_position, public.offers.source_position),
        updated_at = NOW();

      IF v_was_existing THEN
        v_updated := v_updated + 1;
      ELSE
        v_inserted := v_inserted + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'marketplace', p_marketplace,
    'received', v_received,
    'inserted', v_inserted,
    'updated', v_updated,
    'ignored', v_ignored,
    'failed', v_failed,
    'state', CASE WHEN v_failed = 0 THEN 'success' ELSE 'partial_success' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_discovery_offers_v1(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_discovery_offers_v1(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_discovery_offers_v1(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_discovery_offers_v1(text, jsonb) TO service_role;
