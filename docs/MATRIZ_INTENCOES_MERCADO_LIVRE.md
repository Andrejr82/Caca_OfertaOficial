# Matriz de Intenções do Mercado Livre

Documento de referência para discovery, classificação e comparação de ofertas no site brasileiro do Mercado Livre (`MLB`).

## Regra oficial de resolução de categorias

Os nomes abaixo são intenções comerciais. Eles não devem ser tratados como `category_id` fixos sem confirmação da API.

Para cada termo ou produto, a integração deve:

1. Consultar `GET /sites/MLB/domain_discovery/search?q={TERMO}&limit=...`.
2. Selecionar a sugestão de maior probabilidade, mantendo as alternativas para auditoria.
3. Consultar `GET /categories/{CATEGORY_ID}`.
4. Persistir `category_id`, `category_name`, `path_from_root` e `children_categories` retornados oficialmente.
5. Consultar `GET /categories/{CATEGORY_ID}/attributes` quando os atributos forem necessários para agrupar produtos.
6. Usar o `category_id` oficial para discovery e validação; nunca depender apenas do nome textual.

As categorias são específicas do site. Portanto, os IDs `MLB` do Brasil não podem ser reutilizados em outros marketplaces ou países.

Referências oficiais:

- [Categorização de produtos](https://developers.mercadolivre.com.br/pt_br/categorizacao-de-produtos)
- [Domínios e Categorias](https://developers.mercadolivre.com.br/pt_br/categorias-e-publicacoes)
- [Categorias e atributos](https://developers.mercadolivre.com.br/pt_br/identificadores-de-produtos/categorias-e-publicacoes)
- [Dump oficial de categorias](https://developers.mercadolivre.com.br/pt_br/dump-de-categorias)

## Matriz corrigida

| Cenário | Intenções comerciais | Famílias/categorias oficiais a resolver | Termos de descoberta recomendados | Regra de separação |
|---|---|---|---|---|
| `enxoval_casamento` | Cama, banho, mesa posta, cozinha, organização e conforto | `Cama, Mesa e Banho`; artigos de cama; artigos de banho; mesa posta; organização doméstica | jogo de cama, lençol, edredom, colcha, manta, travesseiro, toalha, tapete, cortina, aparelho de jantar, faqueiro, copos, taças, organizador | Separar cama, banho, mesa posta e organização para evitar grupos incompatíveis |
| `eletros_cozinha` | Preparo, bebidas, cocção e pequenos eletros | `Eletrodomésticos`; cafeteira; batedeira; liquidificador; fritadeira elétrica; mixer; sanduicheira; chaleira; processador; forno elétrico; pipoqueira | cafeteira elétrica, cafeteira expresso, batedeira planetária, liquidificador, air fryer, mixer, sanduicheira elétrica, chaleira elétrica, processador de alimentos, forno elétrico | Capacidade, voltagem, tipo e marca devem ser atributos de agrupamento |
| `eletrodomesticos_cozinha` | Eletros compactos e eletrodomésticos de maior ticket | `Eletrodomésticos`; refrigeradores; freezers; fogões; cooktops; micro-ondas; máquinas de lavar; lava-louças; fornos; fritadeiras elétricas | geladeira, refrigerador, freezer, fogão, cooktop, micro-ondas, máquina de lavar, lava-louças, forno, air fryer | Não misturar linha branca com pequenos eletros no mesmo grupo de produto |
| `tecnologia_desejo` | Telefonia, informática, áudio e casa inteligente | `Celulares e Telefones`; smartphones; notebooks; tablets; monitores; fones; smartwatches; `Eletrônicos`; automação residencial | celular, smartphone, iPhone, Galaxy, Redmi, notebook, tablet, monitor, fone Bluetooth, smartwatch, smart TV, Alexa, Echo, lâmpada inteligente, tomada inteligente | Separar produto principal de acessórios, cabos e adaptadores |
| `gamer_tecnologia` | PC gamer, periféricos, consoles e setup | `Informática`; computadores; placas de vídeo; monitores; teclados; mouses; headsets; cadeiras; consoles; jogos | PC gamer, computador gamer, placa de vídeo, monitor gamer, teclado gamer, mouse gamer, headset gamer, cadeira gamer, PlayStation, Xbox, Nintendo Switch, console | Não agrupar jogo, console, periférico e móvel como se fossem o mesmo produto |
| `treino_academia` | Vestuário, calçados, equipamentos e suplementos | `Esportes e Fitness`; corrida; roupas esportivas; halteres; faixas; yoga; cordas; suplementos | tênis de corrida, roupa fitness, legging, halter, faixa elástica, tapete de yoga, corda de pular, whey, creatina | Suplementos devem permanecer em fila própria e passar por regras de conteúdo e evidência |
| `mae_de_primeira_viagem` | Higiene, alimentação, transporte, sono e segurança do bebê | `Bebês`; fraldas; lenços; mamadeiras; carrinhos; berços; banheiras; bolsas; cadeiras de alimentação; babás eletrônicas; cadeirinhas | fralda, lenço umedecido, mamadeira, carrinho de bebê, berço, banheira de bebê, bolsa maternidade, cadeira de alimentação, babá eletrônica, cadeirinha infantil | Não misturar produtos de bebê com produtos pet |
| `dono_de_pet` | Alimentação, higiene, descanso, transporte e lazer animal | `Animais e Pets`; cães; gatos; ração; areia; tapetes higiênicos; camas; brinquedos; coleiras; caixas de transporte; arranhadores | ração para cachorro, ração para gato, areia para gatos, tapete higiênico, cama pet, brinquedo pet, coleira, caixa de transporte, arranhador, higiene pet | Separar espécie, porte, finalidade e consumível de acessório |
| `pet_bebe` | Duas intenções independentes: pet e bebê | `Animais e Pets` + `Bebês` | Executar os termos de `dono_de_pet` e `mae_de_primeira_viagem` separadamente | Nunca persistir como uma única intenção competitiva; gerar duas filas independentes |
| `morando_sozinho` | Cozinha compacta, limpeza, lavanderia e organização | `Casa, Móveis e Decoração`; `Eletrodomésticos`; utilidades domésticas; organização; lavanderia | air fryer compacta, sanduicheira, varal, ferro de passar, tábua de passar, lixeira, organizador, cabide, cesto, aspirador | A intenção é editorial; os grupos oficiais continuam separados por categoria e tipo |
| `moda_masculina` | Roupas, calçados e acessórios masculinos | `Moda`; camisas; camisetas; bermudas; calças; moletons; tênis; sapatos; cintos; carteiras; mochilas; óculos | camisa masculina, camiseta masculina, bermuda masculina, calça masculina, moletom masculino, tênis masculino, sapato masculino, cinto masculino, carteira masculina, mochila masculina, óculos masculino | Calçado, vestuário e acessório não devem concorrer no mesmo grupo |
| `acessorios_relogios` | Relógios, joias, bolsas e acessórios | `Acessórios de Moda`; relógios; smartwatches; óculos; colares; anéis; brincos; pulseiras; bonés; mochilas; carteiras | relógio, smartwatch, óculos, colar, anel, brinco, pulseira, boné, mochila, carteira | Smartwatch também pode pertencer à intenção tecnológica; resolver pelo domínio e pelo tipo do produto |
| `beleza_autocuidado` | Pele, cabelo, maquiagem e perfumaria | `Beleza e Cuidado Pessoal`; cuidados com a pele; proteção solar; perfumes; maquiagem; secadores; chapinhas; escovas; modeladores; hidratantes | skincare, protetor solar, perfume, maquiagem, secador, chapinha, escova secadora, modelador, hidratante | Não publicar alegações médicas ou de saúde sem evidência; separar cosmético de aparelho |
| `viagem_aventura` | Bagagem, camping, praia e trilha | `Malas e Bolsas`; bagagem; mochilas; organização de viagem; camping; outdoor; praia | mala de bordo, mala de viagem, organizador de mala, mochila, barraca, saco de dormir, lanterna, cadeira de praia, equipamento de trilha | Separar bagagem, camping e praia; não misturar acessórios sem função equivalente |
| `impulso_casa` | Utilidades rápidas e decoração funcional | `Casa, Móveis e Decoração`; organização; iluminação; limpeza; utilidades domésticas | organizador, iluminação, lixeira, cafeteira compacta, balança, utensílio, luminária, produto de limpeza | Usar como filtro editorial; cada item deve manter sua categoria oficial específica |
| `casa_moveis` | Móveis para quarto, sala e escritório | `Casa, Móveis e Decoração`; guarda-roupas; camas; colchões; sofás; racks; painéis; mesas; escrivaninhas; cadeiras; cômodas | guarda-roupa, cama, colchão, sofá, rack, painel para TV, mesa, escrivaninha, cadeira de escritório, cômoda | Móveis não devem concorrer com decoração leve ou organizadores |
| `moda_fitness_beleza_viagem` | Cenário originalmente amplo | Não deve possuir uma única categoria oficial | Substituir pelos quatro cenários abaixo | Contrato descontinuado: dividir em `moda_masculina`, `treino_academia`, `beleza_autocuidado` e `viagem_aventura` |

## Correções estruturais obrigatórias

### 1. Separação de `moda_fitness_beleza_viagem`

O cenário deve ser substituído por quatro filas independentes:

```text
moda_masculina
treino_academia
beleza_autocuidado
viagem_aventura
```

Motivo: são domínios, atributos, riscos e comportamentos de compra diferentes. Uma busca única mistura produtos que não devem competir na mesma seleção.

### 2. Separação de `pet_bebe`

O cenário deve gerar duas execuções independentes:

```text
dono_de_pet
mae_de_primeira_viagem
```

Cada fila deve manter sua própria categoria oficial, atributos, deduplicação e limite de curadoria.

### 3. Correção de nomenclatura

Os seguintes nomes são apenas rótulos editoriais e devem ser resolvidos pela API:

- `air fryer` → buscar o domínio/categoria oficial retornado pelo `domain_discovery`;
- `smart TV` → resolver dentro de `Eletrônicos`/televisores conforme a resposta vigente;
- `cadeirinha` → distinguir cadeirinha infantil de cadeira comum;
- `whey` e `creatina` → resolver dentro do domínio oficial correspondente de suplementos;
- `pet` → não usar como categoria final; usar a categoria oficial retornada para cães, gatos ou acessórios;
- `organização` → tratar como intenção, não como `category_id` fixo.

## Regras de cobertura e comparação

1. A categoria deve ser identificada por `category_id`, não somente por texto.
2. O `path_from_root` deve ser armazenado para auditoria.
3. Produtos só podem concorrer se tiverem categoria oficial compatível.
4. Atributos como marca, modelo, capacidade, voltagem, tamanho e espécie devem ser usados para formar grupos.
5. Categorias diferentes não devem ser agrupadas apenas porque compartilham uma palavra-chave.
6. Acessórios devem ser separados do produto principal.
7. O resultado do `domain_discovery` deve ser validado por `/categories/{id}`.
8. A árvore deve ser atualizada periodicamente usando o dump e os cabeçalhos `X-Content-Created` e `X-Content-MD5`.
9. Alterações de categoria devem ser tratadas porque o Mercado Livre documenta recategorização automática de publicações.
10. A categoria final de publicação deve ser a categoria folha apropriada, quando o fluxo envolver publicação de anúncio.

## Contrato recomendado para o sistema

```json
{
  "scenario_id": "eletros_cozinha",
  "marketplace": "mercado_livre",
  "site_id": "MLB",
  "intent_term": "air fryer",
  "category_id": "MLB...",
  "category_name": "...",
  "path_from_root": [],
  "children_categories": [],
  "attributes": [],
  "category_source": "domain_discovery",
  "category_resolved_at": "2026-07-29T00:00:00Z"
}
```

`category_id` e nomes concretos devem ser preenchidos pela resposta atual da API, pois a árvore do Mercado Livre pode mudar.

## Conclusão

A matriz corrigida mantém as intenções comerciais úteis, mas elimina dois contratos amplos e perigosos:

- `moda_fitness_beleza_viagem` deixa de existir como cenário único;
- `pet_bebe` deixa de misturar duas famílias de produtos.

O Mercado Livre deve ser tratado como uma árvore oficial por site, resolvida por `domain_discovery`, confirmada por `/categories/{id}` e enriquecida por `/attributes`. A matriz não deve congelar IDs sem sincronização oficial.
