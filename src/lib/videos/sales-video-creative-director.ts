export type SalesVideoOffer = {
  product_name: string;
  category?: string | null;
};

export type SalesVideoArchetype =
  | "footwear"
  | "fashion"
  | "kitchen_appliance"
  | "cookware"
  | "beauty"
  | "pet"
  | "power_tool"
  | "electronics"
  | "cleaning_organization"
  | "generic";

export type SalesVideoDirection = {
  archetype: SalesVideoArchetype;
  label: string;
  desire: string;
  environment: string;
  openingAction: string;
  mainAction: string;
  proofAction: string;
  camera: string;
  lighting: string;
  antiPresentation: string;
  restrictions: string;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function classifySalesVideoArchetype(offer: SalesVideoOffer): SalesVideoArchetype {
  const text = normalize(`${offer.category ?? ""} ${offer.product_name}`);
  if (/(tenis|sapato|sandalia|bota|sapatilha|calcado)/.test(text)) return "footwear";
  if (/(vestido|camisa|camiseta|blusa|calca|short|saia|roupa|moda|vestuario)/.test(text)) return "fashion";
  if (/(sanduicheira|cafeteira|liquidificador|mixer|air fryer|fritadeira|chaleira|torradeira|processador)/.test(text)) return "kitchen_appliance";
  if (/(panela|frigideira|assadeira|forma|utensilio de cozinha)/.test(text)) return "cookware";
  if (/(secador|chapinha|escova modeladora|maquiagem|batom|serum|creme|perfume|barbeador|aparador|beleza)/.test(text)) return "beauty";
  if (/(pet|cachorro|gato|tapete higienico|areia para gato|comedouro|coleira|brinquedo.*gato|brinquedo.*cachorro)/.test(text)) return "pet";
  if (/(furadeira|parafusadeira|serra|lixadeira|esmerilhadeira|ferramenta)/.test(text)) return "power_tool";
  if (/(notebook|smartphone|celular|fone|headset|monitor|teclado|mouse|console|controle|tablet|power bank|carregador)/.test(text)) return "electronics";
  if (/(organizador|mop|aspirador|lavadora|limpeza|percarbonato|tira manchas|esponja)/.test(text)) return "cleaning_organization";
  return "generic";
}

export function getSalesVideoDirection(offer: SalesVideoOffer): SalesVideoDirection {
  const archetype = classifySalesVideoArchetype(offer);
  switch (archetype) {
    case "footwear":
      return {
        archetype,
        label: "Calçado em movimento",
        desire: "visual no pé + sensação de rotina ativa",
        environment: "ambiente urbano realista, calçada limpa ou pista de caminhada, luz natural de fim de tarde",
        openingAction: "abrir já com o calçado sendo colocado no pé ou com o primeiro passo em movimento; nada de produto parado sendo apresentado",
        mainAction: "mostrar caminhada e, se coerente com o nome do produto, corrida leve ou treino; o produto permanece no pé e em uso",
        proofAction: "close lateral do calçado flexionando durante o passo, cadarço sendo ajustado e dois ou três passos contínuos",
        camera: "câmera baixa acompanhando os pés, close lateral e plano de três-quartos; cortes motivados pelo movimento, sem giro 360 graus",
        lighting: "luz natural suave, contraste moderado, aparência lifestyle premium sem cara de estúdio",
        antiPresentation: "não mostrar avatar parado, segurando o calçado para a câmera, apontando para o produto ou fazendo pose de vendedor",
        restrictions: "não afirmar amortecimento, leveza, conforto, performance, material ou tecnologia além do que estiver explicitamente no nome ou visualmente verificável",
      };
    case "fashion":
      return {
        archetype,
        label: "Moda em uso",
        desire: "caimento + movimento + aparência no corpo",
        environment: "ambiente lifestyle clean e realista, com luz natural suave",
        openingAction: "abrir com a pessoa já vestindo a peça e entrando em movimento, sem mostrar a peça sendo exibida nas mãos",
        mainAction: "caminhar, virar levemente o corpo e usar a peça em contexto cotidiano coerente",
        proofAction: "mostrar caimento, comprimento, proporção e movimento do tecido em ângulos conservadores",
        camera: "plano médio, três-quartos e detalhe de tecido/caimento; movimentos suaves de acompanhamento",
        lighting: "luz natural editorial, pele e tecido com textura realista",
        antiPresentation: "não usar pose de catálogo estática nem avatar explicando a peça para a câmera",
        restrictions: "não inventar tecido, composição, transparência, tamanho, bolsos, fechamento ou detalhes não visíveis",
      };
    case "kitchen_appliance":
      return {
        archetype,
        label: "Eletroportátil em uso",
        desire: "praticidade + resultado visual de preparo",
        environment: "cozinha residencial contemporânea, organizada, iluminada e realmente habitada",
        openingAction: "abrir com mãos preparando a ação real do produto na bancada; o produto já faz parte da rotina, sem apresentação frontal",
        mainAction: "executar a função principal de forma simples e visualmente compreensível, somente quando a função estiver clara pelo produto",
        proofAction: "close do gesto de uso, abertura/fechamento/acionamento quando aplicável e resultado diretamente observável",
        camera: "close de bancada, plano sobre o ombro e detalhe funcional; câmera acompanha mãos e produto",
        lighting: "luz quente de cozinha com aparência natural, reflexos controlados e alimento realista quando pertinente",
        antiPresentation: "não mostrar avatar segurando o aparelho para a câmera nem falando como apresentador de televendas",
        restrictions: "não inventar potência, capacidade, tempo de preparo, acessórios, modos ou resultado culinário incompatível",
      };
    case "cookware":
      return {
        archetype,
        label: "Panela/utensílio em contexto",
        desire: "rotina de cozinha + praticidade visual",
        environment: "cozinha residencial realista com fogão e bancada discretos",
        openingAction: "abrir já com o utensílio sendo posicionado ou utilizado de modo seguro e coerente",
        mainAction: "mostrar manuseio real, tampa/alça quando visível e uma ação culinária simples sem exagero",
        proofAction: "close de pegada, abertura/fechamento e escala do produto na bancada ou fogão",
        camera: "plano de bancada e close lateral, movimentos lentos seguindo as mãos",
        lighting: "luz doméstica quente e limpa, sem estética artificial de catálogo",
        antiPresentation: "não usar apresentador exibindo a panela parada para a câmera",
        restrictions: "não inventar capacidade, material, pressão, antiaderência, compatibilidade ou segurança não informada",
      };
    case "beauty":
      return {
        archetype,
        label: "Beleza em aplicação",
        desire: "ritual de uso + resultado visual plausível",
        environment: "penteadeira ou banheiro elegante e realista, iluminação suave e pele natural",
        openingAction: "abrir com o produto já entrando no ritual de uso, sem apresentação estática da embalagem",
        mainAction: "mostrar aplicação/manuseio somente quando a forma de uso for evidente; priorizar gesto e textura visível",
        proofAction: "close de mãos, aplicação e acabamento observável sem antes/depois artificial",
        camera: "close de detalhe e plano médio suave, foco alternando entre produto e gesto",
        lighting: "luz beauty suave e realista, sem filtro excessivo",
        antiPresentation: "não usar avatar falando para a câmera enquanto segura o produto como propaganda tradicional",
        restrictions: "não inventar resultado clínico, hidratação, duração, cobertura, efeito terapêutico ou transformação não comprovada",
      };
    case "pet":
      return {
        archetype,
        label: "Pet em interação",
        desire: "cuidado + rotina mais simples + interação natural",
        environment: "casa realista, segura e confortável para o animal, com luz natural",
        openingAction: "abrir com o animal ou tutor já interagindo com o produto em contexto de rotina",
        mainAction: "mostrar uso natural sem forçar comportamento; o produto deve permanecer claramente reconhecível",
        proofAction: "mostrar escala, posicionamento, interação e reação natural do animal",
        camera: "altura do animal, close de interação e plano médio do ambiente",
        lighting: "luz doméstica natural, sem cenário esterilizado de catálogo",
        antiPresentation: "não usar tutor parado segurando o produto e falando para a câmera",
        restrictions: "não inventar benefício veterinário, segurança garantida, resistência, redução de ansiedade ou comportamento específico",
      };
    case "power_tool":
      return {
        archetype,
        label: "Ferramenta resolvendo tarefa",
        desire: "problema prático → ação → resultado",
        environment: "bancada de oficina ou garagem organizada, segura e realista",
        openingAction: "abrir com a tarefa já preparada e a ferramenta entrando em ação, sem pose de demonstração",
        mainAction: "executar uma única tarefa simples e controlada compatível com a ferramenta",
        proofAction: "close de empunhadura, acionamento e resultado físico observável da tarefa",
        camera: "plano sobre o ombro, close de mãos e detalhe da ferramenta em ação",
        lighting: "luz funcional de oficina, contraste natural e produto bem legível",
        antiPresentation: "não usar pessoa mostrando a ferramenta parada como catálogo",
        restrictions: "não inventar potência, torque, autonomia, velocidade, material suportado ou acessórios",
      };
    case "electronics":
      return {
        archetype,
        label: "Eletrônico em uso",
        desire: "experiência de uso + integração no setup",
        environment: "setup contemporâneo e organizado, visual premium mas realista",
        openingAction: "abrir com mãos já usando o dispositivo, sem hero shot inicial de produto parado",
        mainAction: "mostrar interação física real com botões, tela ou controles visíveis",
        proofAction: "close de ergonomia, interface somente se já visível na referência e resposta física observável",
        camera: "close de mãos, over-the-shoulder e plano de detalhe do dispositivo",
        lighting: "luz de ambiente controlada, sem esconder portas, botões ou formato real",
        antiPresentation: "não usar apresentador segurando o dispositivo para a câmera",
        restrictions: "não inventar apps, interface, autonomia, memória, conectividade, desempenho ou acessórios",
      };
    case "cleaning_organization":
      return {
        archetype,
        label: "Problema doméstico em ação",
        desire: "ordem/praticidade + mudança visual moderada",
        environment: "ambiente doméstico claro e realista, com situação simples de organização ou limpeza",
        openingAction: "abrir mostrando a tarefa real que será feita e o produto entrando imediatamente em uso",
        mainAction: "executar uma tarefa curta, segura e visualmente compreensível",
        proofAction: "mostrar aplicação, manuseio e resultado moderado, sem transformação milagrosa",
        camera: "plano de detalhe da tarefa e acompanhamento suave das mãos",
        lighting: "luz doméstica clara, textura real das superfícies",
        antiPresentation: "não começar com embalagem sendo mostrada para a câmera",
        restrictions: "não inventar desinfecção, remoção total, composição, segurança química ou eficácia não comprovada",
      };
    default:
      return {
        archetype,
        label: "Produto em situação real",
        desire: "uso compreensível + contexto + benefício visual",
        environment: "ambiente realista coerente com o produto, limpo e cotidiano",
        openingAction: "abrir com o produto já sendo manuseado ou usado de forma plausível, sem apresentação frontal",
        mainAction: "mostrar uma única ação simples que ajude a entender escala, manuseio ou função",
        proofAction: "close do gesto e do resultado diretamente observável",
        camera: "plano de detalhe, três-quartos e acompanhamento suave da ação",
        lighting: "luz natural ou funcional coerente com o ambiente",
        antiPresentation: "não usar pessoa parada segurando o produto, apontando para ele ou falando como vendedor",
        restrictions: "não inventar funções, materiais, benefícios, medidas, acessórios ou características técnicas",
      };
  }
}
