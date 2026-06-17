/**
 * Taxonomia oficial de categorias do Caça Oferta
 * Espelhada nas 24 categorias principais + 153 subcategorias da Pechinchou
 *
 * Uso: normalizeCategory(textoLivre) → { category, subcategory }
 */

// ─── Estrutura de categoria ───────────────────────────────────────────────────
export interface CategoryNode {
  name: string;
  slug: string;
  subcategories: string[];
  /** Palavras-chave para auto-detecção via texto livre */
  keywords: string[];
}

// ─── Taxonomia Completa ───────────────────────────────────────────────────────
export const CATEGORY_TAXONOMY: CategoryNode[] = [
  {
    name: "Telefonia",
    slug: "telefonia",
    subcategories: ["iPhone", "Samsung", "Motorola", "LG", "Xiaomi", "Acessórios para celular", "Asus", "Huawei", "Lenovo", "Nokia", "Positivo", "Realme", "Multilaser", "Infinix", "Alcatel"],
    keywords: ["celular", "smartphone", "telefone", "iphone", "samsung galaxy", "motorola", "xiaomi", "redmi", "poco", "realme", "huawei", "nokia", "asus zenfone", "lenovo", "positivo", "multilaser", "infinix", "alcatel", "lg k", "lg q", "moto g", "moto e", "moto edge", "android", "ios", "5g", "4g lte", "sim card", "chip celular"],
  },
  {
    name: "Televisão",
    slug: "televisao",
    subcategories: ["TV Samsung", "TV LG", "TV Philips", "TV Sony", "TV TCL", "TV AOC", "TV Toshiba", "TV Philco", "TV Panasonic", "TV Britânia", "TV SEMP TCL", "TV Vizzion", "TV Multilaser", "TV Konka", "TV HQ", "TV Hisense", "TV Aiwa"],
    keywords: ["tv ", "televisão", "televisor", "smart tv", "4k uhd", "qled", "oled", "led tv", "android tv", "webos", "tizen", "google tv", "polegadas", '"tv"', "television"],
  },
  {
    name: "Eletrônicos",
    slug: "eletronicos",
    subcategories: ["Casa Inteligente", "Som", "Smartwatch", "Fones de ouvido", "Kindle", "Projetor e Tela", "Receptores e Tv Box", "Pilhas e Baterias", "Home Theater", "DVD e Blu-Ray Player"],
    keywords: ["smartwatch", "fone de ouvido", "headphone", "headset", "earphone", "airpods", "fones", "kindle", "e-reader", "leitor digital", "projetor", "home theater", "som bluetooth", "caixa de som", "speaker", "alto-falante", "pilha", "bateria recarregável", "casa inteligente", "smart home", "alexa", "google home", "tv box", "receptor digital", "blu-ray", "dvd player", "action cam", "câmera digital", "drone"],
  },
  {
    name: "Informática",
    slug: "informatica",
    subcategories: ["Notebook", "Acessórios Informática", "Impressora Multifuncional", "Tablet", "Monitor", "Computador"],
    keywords: ["notebook", "laptop", "computador", "pc gamer", "desktop", "monitor", "teclado", "mouse", "mousepad", "impressora", "scanner", "webcam", "tablet", "ipad", "ssd", "hd externo", "pendrive", "memória ram", "placa de vídeo", "processador", "fonte atx", "gabinete pc", "hub usb", "cabo hdmi", "roteador", "modem", "switch rede"],
  },
  {
    name: "Games",
    slug: "games",
    subcategories: ["Playstation", "Xbox", "Nintendo", "Acessórios Gamer"],
    keywords: ["game", "jogo", "playstation", "ps4", "ps5", "xbox", "nintendo", "switch", "controle gamer", "joystick", "headset gamer", "cadeira gamer", "teclado gamer", "mouse gamer", "monitor gamer", "144hz", "gpu", "placa de video gamer", "streaming game", "console", "videogame"],
  },
  {
    name: "Eletrodomésticos",
    slug: "eletrodomesticos",
    subcategories: ["Geladeira", "Microondas", "Lava e Seca", "Fogão", "Máquina de Lavar", "Forno Elétrico", "Cooktop", "Cervejeira", "Frigobar", "Lava louças", "Máquina de Bebidas", "Tanquinho", "Freezer", "Forno de Embutir", "Coifa e Depurador", "Adega de Vinhos"],
    keywords: ["geladeira", "refrigerador", "freezer", "microondas", "lava e seca", "máquina de lavar", "lavadora de roupas", "fogão", "cooktop", "lava-louça", "lava louças", "frigobar", "cervejeira", "adega", "forno embutir", "coifa", "depurador", "tanquinho"],
  },
  {
    name: "Eletroportáteis",
    slug: "eletroportateis",
    subcategories: ["Fritadeira Elétrica", "Kit Eletroportáteis", "Liquidificador", "Cafeteira", "Batedeira", "Aspirador de pó", "Grill e Sanduicheira", "Lavadora de Alta Pressão", "Panela Elétrica", "Omeleteira", "Máquina de Costura", "Bebedouro e purificador", "Centrífuga de Frutas", "Chaleira", "Chopeira", "Churrasqueira Elétrica", "Espremedor de frutas", "Ferro de Passar", "Mixer", "Passadeira a vapor", "Pipoqueira", "Processador de Alimentos", "Torradeira"],
    keywords: ["fritadeira", "air fryer", "airfryer", "liquidificador", "cafeteira", "batedeira", "aspirador", "robô aspirador", "sanduicheira", "grill elétrico", "lavadora pressão", "panela elétrica", "panela de arroz", "omeleteira", "máquina de costura", "bebedouro", "purificador de água", "espremedor", "ferro de passar", "passadeira vapor", "mixer", "processador alimentos", "torradeira", "chaleira elétrica", "chopeira", "churrasqueira elétrica", "pipoqueira"],
  },
  {
    name: "Ar e Ventilação",
    slug: "ar-e-ventilacao",
    subcategories: ["Ar-Condicionado", "Ventiladores e Circuladores", "Climatizadores", "Umidificador", "Aquecedores"],
    keywords: ["ar condicionado", "ar-condicionado", "split", "ventilador", "circulador de ar", "climatizador", "umidificador", "aquecedor", "inverter btu", "ar portatil", "mini split"],
  },
  {
    name: "Utilidades Domésticas",
    slug: "utilidades-domesticas",
    subcategories: ["Utensílios Domésticos", "Jogo de Panela", "Panela de Pressão", "Faqueiro", "Frigideira", "Aparelho de Jantar", "Taças", "Porta condimentos", "Utilidades Variadas", "Churrasqueira", "Caneca", "Assadeira", "Aparelho de fondue", "Jarra e Copo", "Garrafas", "Outras Panelas", "Potes"],
    keywords: ["panela", "jogo de panelas", "frigideira", "faqueiro", "faca", "utensílios", "utensilio", "caneca", "copo", "taça", "jarra", "garrafa", "assadeira", "forma", "pote", "pote hermético", "churrasqueira", "espeto", "fondue", "aparelho de jantar", "aparelho de café", "porta condimentos", "coador", "escorredor"],
  },
  {
    name: "Cama, Mesa e Banho",
    slug: "cama-mesa-e-banho",
    subcategories: ["Peças de Mesa", "Peças de Cama", "Peças de Banho"],
    keywords: ["roupa de cama", "lençol", "fronha", "edredom", "cobertor", "travesseiro", "colcha", "toalha de banho", "tapete de banheiro", "toalha de rosto", "jogo de cama", "jogo de toalhas", "protetor de colchão", "porta-toalha"],
  },
  {
    name: "Móveis e Decoração",
    slug: "moveis-e-decoracao",
    subcategories: ["Sofá", "Rack e Painéis", "Guarda-Roupa", "Cama", "Conjunto de Mesa", "Cozinha / Armário", "Escritório", "Quarto Infantil", "Decoração", "Cômoda e Sapateira", "Banheiro", "Aparador de sala", "Janelas", "Poltrona"],
    keywords: ["sofá", "sofa", "rack", "painel tv", "guarda-roupa", "guarda roupa", "roupeiro", "armário", "cômoda", "sapateira", "escrivaninha", "mesa de escritório", "cadeira de escritório", "poltrona", "puff", "aparador", "buffet", "decoração", "quadro decorativo", "luminária", "espelho", "vasos", "prateleira", "estante", "nicho", "conjunto de mesa", "mesa de jantar", "cadeira", "banco", "berço", "beliche", "mesa de cabeceira", "janela", "persiana", "cortina"],
  },
  {
    name: "Moda, Beleza e Perfumaria",
    slug: "moda-beleza-e-perfumaria",
    subcategories: ["Moda Feminina", "Moda Masculina", "Perfume Feminino", "Perfume Masculino", "Acessórios de Moda", "Maquiagens", "Escova e Secador", "Bolsas, Malas e Mochilas"],
    keywords: ["roupa", "vestido", "blusa", "camisa", "calça", "shorts", "saia", "casaco", "jaqueta", "moletom", "camiseta", "camiseta masculina", "moda feminina", "moda masculina", "plus size", "lingerie", "cueca", "meias", "perfume", "colônia", "eau de parfum", "eau de toilette", "desodorante", "maquiagem", "base", "batom", "rímel", "sombra", "pó facial", "blush", "bronzer", "escova cabelo", "secador cabelo", "chapinha", "modelador", "bolsa", "mochila", "mala", "carteira", "acessórios moda", "óculos de sol", "cinto", "relógio", "bijuteria", "joias", "calçado", "tênis", "sapato", "sandália", "chinelo", "bota"],
  },
  {
    name: "Petshop",
    slug: "petshop",
    subcategories: ["Ração", "Cuidados Animais"],
    keywords: ["ração", "petisco animal", "pet", "cachorro", "gato", "cão", "felino", "coleira", "guia pet", "cama pet", "arranhador", "aquário", "peixe", "hamster", "coelho", "pássaro", "vermifugo", "antipulgas", "antipulga", "shampoo pet", "comedouro", "bebedouro pet", "brinquedo pet"],
  },
  {
    name: "Crianças e Bebês",
    slug: "criancas-e-bebes",
    subcategories: ["Fraldas", "Lenço Umedecido", "Roupas Infantis", "Banho e Higiene do bebê", "Cadeirinha e carrinho", "Brinquedos", "Mamadeira", "Berços e Guarda Roupas"],
    keywords: ["fralda", "lenço umedecido", "roupa infantil", "roupa bebê", "body bebê", "macacão bebê", "sapato infantil", "carrinho de bebê", "cadeirinha bebê", "bebê conforto", "mamadeira", "chupeta", "berço", "berço portátil", "banheira bebê", "shampoo infantil", "talco bebê", "pomada bebê", "brinquedo infantil", "boneca", "carrinho de brinquedo", "lego", "pelúcia"],
  },
  {
    name: "Saúde",
    slug: "saude",
    subcategories: ["Cuidados Pessoais", "Balanças", "Acessórios para Saúde", "Medidores de Pressão", "Medidor de Glicose", "Oxímetro", "Termômetros"],
    keywords: ["balança digital", "medidor de pressão", "aparelho de pressão", "glicosímetro", "medidor glicose", "oxímetro", "termômetro", "nebulizador", "inalador", "bengala", "cadeira de rodas", "muleta", "cuidados pessoais", "higiene pessoal", "aparelho de barbear", "barbeador elétrico", "depilador", "massageador", "escova de dente elétrica", "fio dental"],
  },
  {
    name: "Esporte e Lazer",
    slug: "esporte-e-lazer",
    subcategories: ["Suplementos Alimentares", "Bicicleta", "Artigos de Academia", "Artigos esportivos", "Chuteira", "Instrumentos Musicais", "Jogos", "Piscina", "Artigos de praia"],
    keywords: ["whey protein", "suplemento", "creatina", "barra de proteína", "pré-treino", "bicicleta", "bike", "patins", "skate", "halteres", "anilha", "barra de musculação", "tapete de yoga", "elástico musculação", "chuteira", "bola de futebol", "tênis esportivo", "raquete", "guitarra", "violão", "teclado musical", "bateria musical", "instrumento musical", "baralho", "jogo de tabuleiro", "piscina infantil", "boia", "protetor solar", "bolsa praia"],
  },
  {
    name: "Ferramentas e Casa",
    slug: "ferramentas-e-casa",
    subcategories: ["Ferramentas Elétricas", "Ferramentas Manuais", "Iluminação", "Material de Construção", "Jardim", "Materiais Hidráulico"],
    keywords: ["furadeira", "parafusadeira", "marreta", "alicate", "chave de fenda", "chave philips", "martelo", "nível de obra", "trena", "serra circular", "lixadeira", "esmerilhadeira", "compressor ar", "lâmpada led", "lâmpada", "luminária", "refletor", "fita led", "cimento", "argamassa", "tinta parede", "massa corrida", "rolo pintura", "mangueira jardim", "regador", "adubo", "vaso de planta", "ferramentas jardim", "cano pvc", "registro", "torneira", "chuveiro", "sifão"],
  },
  {
    name: "Supermercado",
    slug: "supermercado",
    subcategories: ["Produtos de Limpeza", "Produtos de Higiene", "Infantil / Bebês", "Alimentos", "Descartáveis e Utilitários"],
    keywords: ["detergente", "desinfetante", "limpador multiuso", "alvejante", "amaciante", "sabão em pó", "sabão líquido", "esponja de limpeza", "vassoura", "rodo", "sabonete", "shampoo", "condicionador", "creme dental", "papel higiênico", "papel toalha", "fralda", "alimento", "café", "açúcar", "arroz", "feijão", "macarrão", "azeite", "molho", "biscoito", "chocolate", "saco de lixo", "descartável", "prato descartável", "copo descartável"],
  },
  {
    name: "Papelaria e Escritório",
    slug: "papelaria-e-escritorio",
    subcategories: ["Cadernos e Papéis", "Materiais de Escrita", "Outros Itens"],
    keywords: ["caderno", "agenda", "bloco de notas", "papel a4", "papel sulfite", "caneta", "lápis", "canetinha", "marca texto", "borracha", "régua", "compasso", "calculadora", "grampeador", "perfurador", "caixa arquivo", "pasta", "fichário", "post-it", "etiqueta", "fita adesiva", "cola", "tesoura"],
  },
  {
    name: "Livros e Mídias",
    slug: "livros-e-midias",
    subcategories: ["Música", "Livros", "Séries", "Filmes", "Ebook"],
    keywords: ["livro", "ebook", "kindle unlimited", "audiobook", "mangá", "hq", "quadrinhos", "revista", "cd", "vinil", "álbum musical", "dvd", "blu-ray filme", "série completa", "box dvd"],
  },
  {
    name: "Bebidas",
    slug: "bebidas",
    subcategories: ["Outras Bebidas", "Bebidas Alcóolicas", "Energético", "Refrigerante"],
    keywords: ["cerveja", "vinho", "whisky", "vodka", "gin", "cachaça", "champagne", "espumante", "energético", "red bull", "monster", "refrigerante", "coca-cola", "pepsi", "guaraná", "suco de caixinha", "água de coco", "isotônico"],
  },
  {
    name: "Automotivo",
    slug: "automotivo",
    subcategories: ["Acessórios Automotivos", "Motos"],
    keywords: ["carro", "auto", "veículo", "moto", "motocicleta", "capacete", "pneu", "rodas", "óleo motor", "acessório carro", "suporte celular carro", "câmera ré", "câmera veicular", "carregador veicular", "tapete carro", "capa banco carro", "cheiro carro", "insufilm", "farol led carro", "som automotivo", "central multimídia", "alarme carro"],
  },
  {
    name: "Viagens e Pacotes",
    slug: "viagens-e-pacotes",
    subcategories: ["Internacionais", "Nacionais"],
    keywords: ["passagem aérea", "pacote viagem", "hotel", "pousada", "resort", "cruzeiro", "tour", "excursão", "férias", "hospedagem", "mala de viagem", "travel", "pacote turístico"],
  },
  {
    name: "Grátis",
    slug: "gratis",
    subcategories: ["Grátis"],
    keywords: ["grátis", "gratuito", "frete grátis", "de graça", "brinde", "free", "sem custo"],
  },
];

// ─── Mapa slug → node (para lookup rápido) ───────────────────────────────────
export const CATEGORY_MAP = new Map<string, CategoryNode>(
  CATEGORY_TAXONOMY.map((c) => [c.slug, c])
);

// ─── Lista plana dos 24 nomes principais ─────────────────────────────────────
export const MAIN_CATEGORY_NAMES: string[] = CATEGORY_TAXONOMY.map((c) => c.name);

// ─── Função de normalização ───────────────────────────────────────────────────

export interface NormalizedCategory {
  /** Categoria principal (das 24) */
  category: string;
  /** Subcategoria (ou null se não identificada) */
  subcategory: string | null;
}

/**
 * Normaliza um texto livre (vindo do Firecrawl/LLM) para uma das 24 categorias padrão.
 *
 * Estratégia:
 * 1. Match exato de nome de subcategoria → retorna categoria pai + subcategoria
 * 2. Match de keyword no texto → retorna categoria principal
 * 3. Fallback → "Utilidades Domésticas" (categoria mais genérica) ou "Geral"
 */
export function normalizeCategory(rawText: string | null | undefined): NormalizedCategory {
  if (!rawText) {
    return { category: "Geral", subcategory: null };
  }

  const normalized = rawText.toLowerCase().trim();

  // Fase 1: match exato em subcategorias (ex: "Fritadeira Elétrica" → Eletroportáteis)
  for (const node of CATEGORY_TAXONOMY) {
    for (const sub of node.subcategories) {
      if (normalized.includes(sub.toLowerCase())) {
        return { category: node.name, subcategory: sub };
      }
    }
  }

  // Fase 2: match de keywords no texto livre
  // Conta hits por categoria para pegar a de maior relevância
  let bestMatch: CategoryNode | null = null;
  let bestScore = 0;

  for (const node of CATEGORY_TAXONOMY) {
    let score = 0;
    for (const kw of node.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = node;
    }
  }

  if (bestMatch && bestScore > 0) {
    // Tenta identificar a subcategoria usando as mesmas keywords da subcategoria
    let detectedSubcategory: string | null = null;
    for (const sub of bestMatch.subcategories) {
      if (normalized.includes(sub.toLowerCase())) {
        detectedSubcategory = sub;
        break;
      }
    }
    return { category: bestMatch.name, subcategory: detectedSubcategory };
  }

  // Fase 3: Fallback
  return { category: "Geral", subcategory: null };
}

/**
 * Retorna a categoria principal a partir do nome da categoria ou subcategoria.
 * Útil para normalizar categorias já existentes no banco.
 */
export function findMainCategory(categoryName: string): string {
  const { category } = normalizeCategory(categoryName);
  return category;
}

/**
 * Retorna a lista de todas as categorias para uso em formulários/selects.
 */
export function getCategoryOptions(): { label: string; value: string; subcategories: string[] }[] {
  return CATEGORY_TAXONOMY.map((c) => ({
    label: c.name,
    value: c.name,
    subcategories: c.subcategories,
  }));
}
