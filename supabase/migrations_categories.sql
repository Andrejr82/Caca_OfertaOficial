-- =======================================================
-- MIGRATION: CATEGORIAS COMPLETAS (Pechinchou Parity)
-- 24 categorias principais + 153 subcategorias
-- Execute no SQL Editor do Supabase
-- =======================================================

-- 1. CRIAR TABELA DE CATEGORIAS
CREATE TABLE IF NOT EXISTS public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL,
  parent_id  uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

-- 2. ÍNDICES NA TABELA CATEGORIES
CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS categories_slug_idx    ON public.categories(slug);
CREATE INDEX IF NOT EXISTS categories_active_idx  ON public.categories(is_active, display_order);

-- 3. HABILITAR RLS — SELECT público (sem auth), insert/update somente admin
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories public select" ON public.categories;
CREATE POLICY "categories public select"
  ON public.categories FOR SELECT
  USING (true);

-- 4. ADICIONAR COLUNA subcategory NA TABELA OFFERS (se não existir)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS subcategory text;

-- 5. ÍNDICES EM offers.category e offers.subcategory
CREATE INDEX IF NOT EXISTS offers_category_idx    ON public.offers(category);
CREATE INDEX IF NOT EXISTS offers_subcategory_idx ON public.offers(subcategory);

-- =======================================================
-- 6. POPULAR AS CATEGORIAS PRINCIPAIS (24)
-- =======================================================

INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
  ('Ar e Ventilação',          'ar-e-ventilacao',           NULL, 1),
  ('Automotivo',               'automotivo',                NULL, 2),
  ('Bebidas',                  'bebidas',                   NULL, 3),
  ('Cama, Mesa e Banho',       'cama-mesa-e-banho',         NULL, 4),
  ('Crianças e Bebês',         'criancas-e-bebes',          NULL, 5),
  ('Eletrodomésticos',         'eletrodomesticos',          NULL, 6),
  ('Eletrônicos',              'eletronicos',               NULL, 7),
  ('Eletroportáteis',          'eletroportateis',           NULL, 8),
  ('Esporte e Lazer',          'esporte-e-lazer',           NULL, 9),
  ('Ferramentas e Casa',       'ferramentas-e-casa',        NULL, 10),
  ('Games',                    'games',                     NULL, 11),
  ('Grátis',                   'gratis',                    NULL, 12),
  ('Informática',              'informatica',               NULL, 13),
  ('Livros e Mídias',          'livros-e-midias',           NULL, 14),
  ('Moda, Beleza e Perfumaria','moda-beleza-e-perfumaria',  NULL, 15),
  ('Móveis e Decoração',       'moveis-e-decoracao',        NULL, 16),
  ('Papelaria e Escritório',   'papelaria-e-escritorio',    NULL, 17),
  ('Petshop',                  'petshop',                   NULL, 18),
  ('Saúde',                    'saude',                     NULL, 19),
  ('Supermercado',             'supermercado',              NULL, 20),
  ('Telefonia',                'telefonia',                 NULL, 21),
  ('Televisão',                'televisao',                 NULL, 22),
  ('Utilidades Domésticas',    'utilidades-domesticas',     NULL, 23),
  ('Viagens e Pacotes',        'viagens-e-pacotes',         NULL, 24)
ON CONFLICT (slug) DO NOTHING;

-- =======================================================
-- 7. POPULAR SUBCATEGORIAS (153)
-- =======================================================

DO $$
DECLARE
  v_ar          uuid;
  v_auto        uuid;
  v_bebidas     uuid;
  v_cama        uuid;
  v_criancas    uuid;
  v_eletrodom   uuid;
  v_eletronicos uuid;
  v_eletroportateis uuid;
  v_esporte     uuid;
  v_ferramentas uuid;
  v_games       uuid;
  v_gratis      uuid;
  v_informatica uuid;
  v_livros      uuid;
  v_moda        uuid;
  v_moveis      uuid;
  v_papelaria   uuid;
  v_petshop     uuid;
  v_saude       uuid;
  v_supermercado uuid;
  v_telefonia   uuid;
  v_televisao   uuid;
  v_utilidades  uuid;
  v_viagens     uuid;
BEGIN
  SELECT id INTO v_ar          FROM public.categories WHERE slug = 'ar-e-ventilacao';
  SELECT id INTO v_auto        FROM public.categories WHERE slug = 'automotivo';
  SELECT id INTO v_bebidas     FROM public.categories WHERE slug = 'bebidas';
  SELECT id INTO v_cama        FROM public.categories WHERE slug = 'cama-mesa-e-banho';
  SELECT id INTO v_criancas    FROM public.categories WHERE slug = 'criancas-e-bebes';
  SELECT id INTO v_eletrodom   FROM public.categories WHERE slug = 'eletrodomesticos';
  SELECT id INTO v_eletronicos FROM public.categories WHERE slug = 'eletronicos';
  SELECT id INTO v_eletroportateis FROM public.categories WHERE slug = 'eletroportateis';
  SELECT id INTO v_esporte     FROM public.categories WHERE slug = 'esporte-e-lazer';
  SELECT id INTO v_ferramentas FROM public.categories WHERE slug = 'ferramentas-e-casa';
  SELECT id INTO v_games       FROM public.categories WHERE slug = 'games';
  SELECT id INTO v_gratis      FROM public.categories WHERE slug = 'gratis';
  SELECT id INTO v_informatica FROM public.categories WHERE slug = 'informatica';
  SELECT id INTO v_livros      FROM public.categories WHERE slug = 'livros-e-midias';
  SELECT id INTO v_moda        FROM public.categories WHERE slug = 'moda-beleza-e-perfumaria';
  SELECT id INTO v_moveis      FROM public.categories WHERE slug = 'moveis-e-decoracao';
  SELECT id INTO v_papelaria   FROM public.categories WHERE slug = 'papelaria-e-escritorio';
  SELECT id INTO v_petshop     FROM public.categories WHERE slug = 'petshop';
  SELECT id INTO v_saude       FROM public.categories WHERE slug = 'saude';
  SELECT id INTO v_supermercado FROM public.categories WHERE slug = 'supermercado';
  SELECT id INTO v_telefonia   FROM public.categories WHERE slug = 'telefonia';
  SELECT id INTO v_televisao   FROM public.categories WHERE slug = 'televisao';
  SELECT id INTO v_utilidades  FROM public.categories WHERE slug = 'utilidades-domesticas';
  SELECT id INTO v_viagens     FROM public.categories WHERE slug = 'viagens-e-pacotes';

  -- Ar e Ventilação (5)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Ar-Condicionado',           'ar-condicionado',           v_ar, 1),
    ('Ventiladores e Circuladores','ventiladores-e-circuladores',v_ar, 2),
    ('Climatizadores',            'climatizadores',            v_ar, 3),
    ('Umidificador',              'umidificador',              v_ar, 4),
    ('Aquecedores',               'aquecedores',               v_ar, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- Automotivo (2)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Acessórios Automotivos', 'acessorios-automotivos', v_auto, 1),
    ('Motos',                  'motos',                  v_auto, 2)
  ON CONFLICT (slug) DO NOTHING;

  -- Bebidas (4)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Outras Bebidas',     'outras-bebidas',     v_bebidas, 1),
    ('Bebidas Alcóolicas', 'bebidas-alcoolicas', v_bebidas, 2),
    ('Energético',         'energetico',         v_bebidas, 3),
    ('Refrigerante',       'refrigerante',       v_bebidas, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- Cama, Mesa e Banho (3)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Peças de Mesa',  'pecas-de-mesa',  v_cama, 1),
    ('Peças de Cama',  'pecas-de-cama',  v_cama, 2),
    ('Peças de Banho', 'pecas-de-banho', v_cama, 3)
  ON CONFLICT (slug) DO NOTHING;

  -- Crianças e Bebês (8)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Fraldas',                    'fraldas',                    v_criancas, 1),
    ('Lenço Umedecido',            'lenco-umedecido',            v_criancas, 2),
    ('Roupas Infantis',            'roupas-infantis',            v_criancas, 3),
    ('Banho e Higiene do bebê',    'banho-e-higiene-do-bebe',    v_criancas, 4),
    ('Cadeirinha e carrinho',      'cadeirinha-e-carrinho',      v_criancas, 5),
    ('Brinquedos',                 'brinquedos',                 v_criancas, 6),
    ('Mamadeira',                  'mamadeira',                  v_criancas, 7),
    ('Berços e Guarda Roupas',     'bercos-e-guarda-roupas',     v_criancas, 8)
  ON CONFLICT (slug) DO NOTHING;

  -- Eletrodomésticos (16)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Geladeira',           'geladeira',           v_eletrodom,  1),
    ('Microondas',          'microondas',           v_eletrodom,  2),
    ('Lava e Seca',         'lava-e-seca',          v_eletrodom,  3),
    ('Fogão',               'fogao',               v_eletrodom,  4),
    ('Máquina de Lavar',    'maquina-de-lavar',     v_eletrodom,  5),
    ('Forno Elétrico',      'forno-eletrico',       v_eletrodom,  6),
    ('Cooktop',             'cooktop',              v_eletrodom,  7),
    ('Cervejeira',          'cervejeira',           v_eletrodom,  8),
    ('Frigobar',            'frigobar',             v_eletrodom,  9),
    ('Lava louças',         'lava-loucas',          v_eletrodom, 10),
    ('Máquina de Bebidas',  'maquina-de-bebidas',   v_eletrodom, 11),
    ('Tanquinho',           'tanquinho',            v_eletrodom, 12),
    ('Freezer',             'freezer',              v_eletrodom, 13),
    ('Forno de Embutir',    'forno-de-embutir',     v_eletrodom, 14),
    ('Coifa e Depurador',   'coifa-e-depurador',    v_eletrodom, 15),
    ('Adega de Vinhos',     'adega-de-vinhos',      v_eletrodom, 16)
  ON CONFLICT (slug) DO NOTHING;

  -- Eletrônicos (10)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Casa Inteligente',       'casa-inteligente',      v_eletronicos,  1),
    ('Som',                    'som',                   v_eletronicos,  2),
    ('Smartwatch',             'smartwatch',            v_eletronicos,  3),
    ('Fones de ouvido',        'fones-de-ouvido',       v_eletronicos,  4),
    ('Kindle',                 'kindle',                v_eletronicos,  5),
    ('Projetor e Tela',        'projetor-e-tela',       v_eletronicos,  6),
    ('Receptores e Tv Box',    'receptores-e-tv-box',   v_eletronicos,  7),
    ('Pilhas e Baterias',      'pilhas-e-baterias',     v_eletronicos,  8),
    ('Home Theater',           'home-theater',          v_eletronicos,  9),
    ('DVD e Blu-Ray Player',   'dvd-e-blu-ray-player',  v_eletronicos, 10)
  ON CONFLICT (slug) DO NOTHING;

  -- Eletroportáteis (23)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Fritadeira Elétrica',       'fritadeira-eletrica',       v_eletroportateis,  1),
    ('Kit Eletroportáteis',       'kit-eletroportateis',       v_eletroportateis,  2),
    ('Liquidificador',            'liquidificador',            v_eletroportateis,  3),
    ('Cafeteira',                 'cafeteira',                 v_eletroportateis,  4),
    ('Batedeira',                 'batedeira',                 v_eletroportateis,  5),
    ('Aspirador de pó',           'aspirador-de-po',           v_eletroportateis,  6),
    ('Grill e Sanduicheira',      'grill-e-sanduicheira',      v_eletroportateis,  7),
    ('Lavadora de Alta Pressão',  'lavadora-de-alta-pressao',  v_eletroportateis,  8),
    ('Panela Elétrica',           'panela-eletrica',           v_eletroportateis,  9),
    ('Omeleteira',                'omeleteira',                v_eletroportateis, 10),
    ('Máquina de Costura',        'maquina-de-costura',        v_eletroportateis, 11),
    ('Bebedouro e purificador',   'bebedouro-e-purificador',   v_eletroportateis, 12),
    ('Centrífuga de Frutas',      'centrifuga-de-frutas',      v_eletroportateis, 13),
    ('Chaleira',                  'chaleira',                  v_eletroportateis, 14),
    ('Chopeira',                  'chopeira',                  v_eletroportateis, 15),
    ('Churrasqueira Elétrica',    'churrasqueira-eletrica',    v_eletroportateis, 16),
    ('Espremedor de frutas',      'espremedor-de-frutas',      v_eletroportateis, 17),
    ('Ferro de Passar',           'ferro-de-passar',           v_eletroportateis, 18),
    ('Mixer',                     'mixer',                     v_eletroportateis, 19),
    ('Passadeira a vapor',        'passadeira-a-vapor',        v_eletroportateis, 20),
    ('Pipoqueira',                'pipoqueira',                v_eletroportateis, 21),
    ('Processador de Alimentos',  'processador-de-alimentos',  v_eletroportateis, 22),
    ('Torradeira',                'torradeira',                v_eletroportateis, 23)
  ON CONFLICT (slug) DO NOTHING;

  -- Esporte e Lazer (9)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Suplementos Alimentares', 'suplementos-alimentares', v_esporte, 1),
    ('Bicicleta',               'bicicleta',               v_esporte, 2),
    ('Artigos de Academia',     'artigos-de-academia',     v_esporte, 3),
    ('Artigos esportivos',      'artigos-esportivos',      v_esporte, 4),
    ('Chuteira',                'chuteira',                v_esporte, 5),
    ('Instrumentos Musicais',   'instrumentos-musicais',   v_esporte, 6),
    ('Jogos',                   'jogos',                   v_esporte, 7),
    ('Piscina',                 'piscina',                 v_esporte, 8),
    ('Artigos de praia',        'artigos-de-praia',        v_esporte, 9)
  ON CONFLICT (slug) DO NOTHING;

  -- Ferramentas e Casa (6)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Ferramentas Elétricas',   'ferramentas-eletricas',   v_ferramentas, 1),
    ('Ferramentas Manuais',     'ferramentas-manuais',     v_ferramentas, 2),
    ('Iluminação',              'iluminacao',              v_ferramentas, 3),
    ('Material de Construção',  'material-de-construcao',  v_ferramentas, 4),
    ('Jardim',                  'jardim',                  v_ferramentas, 5),
    ('Materiais Hidráulico',    'materiais-hidraulico',    v_ferramentas, 6)
  ON CONFLICT (slug) DO NOTHING;

  -- Games (4)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Playstation',      'playstation',      v_games, 1),
    ('Xbox',             'xbox',             v_games, 2),
    ('Nintendo',         'nintendo',         v_games, 3),
    ('Acessórios Gamer', 'acessorios-gamer', v_games, 4)
  ON CONFLICT (slug) DO NOTHING;

  -- Grátis (1)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Grátis', 'gratis-item', v_gratis, 1)
  ON CONFLICT (slug) DO NOTHING;

  -- Informática (6)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Notebook',                  'notebook',                 v_informatica, 1),
    ('Acessórios Informática',    'acessorios-informatica',   v_informatica, 2),
    ('Impressora Multifuncional', 'impressora-multifuncional',v_informatica, 3),
    ('Tablet',                    'tablet',                   v_informatica, 4),
    ('Monitor',                   'monitor',                  v_informatica, 5),
    ('Computador',                'computador',               v_informatica, 6)
  ON CONFLICT (slug) DO NOTHING;

  -- Livros e Mídias (5)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Música',  'musica',  v_livros, 1),
    ('Livros',  'livros',  v_livros, 2),
    ('Séries',  'series',  v_livros, 3),
    ('Filmes',  'filmes',  v_livros, 4),
    ('Ebook',   'ebook',   v_livros, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- Moda, Beleza e Perfumaria (8)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Moda Feminina',           'moda-feminina',            v_moda, 1),
    ('Moda Masculina',          'moda-masculina',           v_moda, 2),
    ('Perfume Feminino',        'perfume-feminino',         v_moda, 3),
    ('Perfume Masculino',       'perfume-masculino',        v_moda, 4),
    ('Acessórios de Moda',      'acessorios-de-moda',       v_moda, 5),
    ('Maquiagens',              'maquiagens',               v_moda, 6),
    ('Escova e Secador',        'escova-e-secador',         v_moda, 7),
    ('Bolsas, Malas e Mochilas','bolsas-malas-e-mochilas',  v_moda, 8)
  ON CONFLICT (slug) DO NOTHING;

  -- Móveis e Decoração (14)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Sofá',              'sofa',               v_moveis,  1),
    ('Rack e Painéis',    'rack-e-paineis',      v_moveis,  2),
    ('Guarda-Roupa',      'guarda-roupa',        v_moveis,  3),
    ('Cama',              'cama',                v_moveis,  4),
    ('Conjunto de Mesa',  'conjunto-de-mesa',    v_moveis,  5),
    ('Cozinha / Armário', 'cozinha-armario',     v_moveis,  6),
    ('Escritório',        'escritorio-moveis',   v_moveis,  7),
    ('Quarto Infantil',   'quarto-infantil',     v_moveis,  8),
    ('Decoração',         'decoracao',           v_moveis,  9),
    ('Cômoda e Sapateira','comoda-e-sapateira',  v_moveis, 10),
    ('Banheiro',          'banheiro',            v_moveis, 11),
    ('Aparador de sala',  'aparador-de-sala',    v_moveis, 12),
    ('Janelas',           'janelas',             v_moveis, 13),
    ('Poltrona',          'poltrona',            v_moveis, 14)
  ON CONFLICT (slug) DO NOTHING;

  -- Papelaria e Escritório (3)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Cadernos e Papéis',   'cadernos-e-papeis',   v_papelaria, 1),
    ('Materiais de Escrita', 'materiais-de-escrita',v_papelaria, 2),
    ('Outros Itens',         'outros-itens-papelaria',v_papelaria,3)
  ON CONFLICT (slug) DO NOTHING;

  -- Petshop (2)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Ração',           'racao',           v_petshop, 1),
    ('Cuidados Animais','cuidados-animais', v_petshop, 2)
  ON CONFLICT (slug) DO NOTHING;

  -- Saúde (7)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Cuidados Pessoais',    'cuidados-pessoais',    v_saude, 1),
    ('Balanças',             'balancas',             v_saude, 2),
    ('Acessórios para Saúde','acessorios-para-saude',v_saude, 3),
    ('Medidores de Pressão', 'medidores-de-pressao', v_saude, 4),
    ('Medidor de Glicose',   'medidor-de-glicose',   v_saude, 5),
    ('Oxímetro',             'oximetro',             v_saude, 6),
    ('Termômetros',          'termometros',          v_saude, 7)
  ON CONFLICT (slug) DO NOTHING;

  -- Supermercado (5)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Produtos de Limpeza',         'produtos-de-limpeza',         v_supermercado, 1),
    ('Produtos de Higiene',         'produtos-de-higiene',         v_supermercado, 2),
    ('Infantil / Bebês',            'infantil-bebes-supermercado', v_supermercado, 3),
    ('Alimentos',                   'alimentos',                   v_supermercado, 4),
    ('Descartáveis e Utilitários',  'descartaveis-e-utilitarios',  v_supermercado, 5)
  ON CONFLICT (slug) DO NOTHING;

  -- Telefonia (15)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('iPhone',                'iphone',                v_telefonia,  1),
    ('Samsung',               'samsung',               v_telefonia,  2),
    ('Motorola',              'motorola',              v_telefonia,  3),
    ('LG',                    'lg',                    v_telefonia,  4),
    ('Xiaomi',                'xiaomi',                v_telefonia,  5),
    ('Acessórios para celular','acessorios-para-celular',v_telefonia, 6),
    ('Asus',                  'asus',                  v_telefonia,  7),
    ('Huawei',                'huawei',                v_telefonia,  8),
    ('Lenovo',                'lenovo',                v_telefonia,  9),
    ('Nokia',                 'nokia',                 v_telefonia, 10),
    ('Positivo',              'positivo',              v_telefonia, 11),
    ('Realme',                'realme',                v_telefonia, 12),
    ('Multilaser',            'multilaser',            v_telefonia, 13),
    ('Infinix',               'infinix',               v_telefonia, 14),
    ('Alcatel',               'alcatel',               v_telefonia, 15)
  ON CONFLICT (slug) DO NOTHING;

  -- Televisão (17)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('TV Samsung',    'tv-samsung',     v_televisao,  1),
    ('TV LG',         'tv-lg',          v_televisao,  2),
    ('TV Philips',    'tv-philips',     v_televisao,  3),
    ('TV Sony',       'tv-sony',        v_televisao,  4),
    ('TV TCL',        'tv-tcl',         v_televisao,  5),
    ('TV AOC',        'tv-aoc',         v_televisao,  6),
    ('TV Toshiba',    'tv-toshiba',     v_televisao,  7),
    ('TV Philco',     'tv-philco',      v_televisao,  8),
    ('TV Panasonic',  'tv-panasonic',   v_televisao,  9),
    ('TV Britânia',   'tv-britania',    v_televisao, 10),
    ('TV SEMP TCL',   'tv-semp-tcl',    v_televisao, 11),
    ('TV Vizzion',    'tv-vizzion',     v_televisao, 12),
    ('TV Multilaser', 'tv-multilaser',  v_televisao, 13),
    ('TV Konka',      'tv-konka',       v_televisao, 14),
    ('TV HQ',         'tv-hq',          v_televisao, 15),
    ('TV Hisense',    'tv-hisense',     v_televisao, 16),
    ('TV Aiwa',       'tv-aiwa',        v_televisao, 17)
  ON CONFLICT (slug) DO NOTHING;

  -- Utilidades Domésticas (17)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Utensílios Domésticos',  'utensilios-domesticos',  v_utilidades,  1),
    ('Jogo de Panela',         'jogo-de-panela',         v_utilidades,  2),
    ('Panela de Pressão',      'panela-de-pressao',      v_utilidades,  3),
    ('Faqueiro',               'faqueiro',               v_utilidades,  4),
    ('Frigideira',             'frigideira',             v_utilidades,  5),
    ('Aparelho de Jantar',     'aparelho-de-jantar',     v_utilidades,  6),
    ('Taças',                  'tacas',                  v_utilidades,  7),
    ('Porta condimentos',      'porta-condimentos',      v_utilidades,  8),
    ('Utilidades Variadas',    'utilidades-variadas',    v_utilidades,  9),
    ('Churrasqueira',          'churrasqueira',          v_utilidades, 10),
    ('Caneca',                 'caneca',                 v_utilidades, 11),
    ('Assadeira',              'assadeira',              v_utilidades, 12),
    ('Aparelho de fondue',     'aparelho-de-fondue',     v_utilidades, 13),
    ('Jarra e Copo',           'jarra-e-copo',           v_utilidades, 14),
    ('Garrafas',               'garrafas',               v_utilidades, 15),
    ('Outras Panelas',         'outras-panelas',         v_utilidades, 16),
    ('Potes',                  'potes',                  v_utilidades, 17)
  ON CONFLICT (slug) DO NOTHING;

  -- Viagens e Pacotes (2)
  INSERT INTO public.categories (name, slug, parent_id, display_order) VALUES
    ('Internacionais', 'viagens-internacionais', v_viagens, 1),
    ('Nacionais',      'viagens-nacionais',      v_viagens, 2)
  ON CONFLICT (slug) DO NOTHING;

END $$;

-- =======================================================
-- 8. QUERIES DE VERIFICAÇÃO (execute para testar)
-- =======================================================

-- Contagem total de categorias e subcategorias
-- SELECT
--   COUNT(*) FILTER (WHERE parent_id IS NULL) AS total_categorias_principais,
--   COUNT(*) FILTER (WHERE parent_id IS NOT NULL) AS total_subcategorias,
--   COUNT(*) AS total_geral
-- FROM public.categories;

-- Listagem hierárquica
-- SELECT
--   COALESCE(p.name, c.name) AS categoria_principal,
--   CASE WHEN c.parent_id IS NOT NULL THEN c.name ELSE NULL END AS subcategoria,
--   c.slug
-- FROM public.categories c
-- LEFT JOIN public.categories p ON p.id = c.parent_id
-- ORDER BY COALESCE(p.display_order, c.display_order), c.display_order;
