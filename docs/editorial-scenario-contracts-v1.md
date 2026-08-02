# Contratos editoriais V1

Esta branch substitui os cenários operacionais anteriores por dezesseis filas editoriais. Os mecanismos de busca não foram trocados: Shopee continua usando o discovery nativo atual, Mercado Livre continua usando a API oficial existente e Amazon continua usando o discovery por browse node/termo existente.

## Roteamento

| Fila | Horário | Cenário | Modo |
|---|---:|---|---|
| Casa e Cozinha | 07h | `casa_cozinha_editorial` | API/search |
| Organização | 08h | `organizacao_editorial` | API/search |
| Ferramentas | 09h | `ferramentas_editorial` | API/search |
| Informática | 10h | `informatica_editorial` | API/search |
| Celulares | 11h | `celulares_editorial` | API/search |
| Beleza | 12h | `beleza_editorial` | API/search |
| Moda | 13h | `moda_editorial` | API/search |
| Esporte | 14h | `esporte_editorial` | API/search |
| Pet | 15h | `pet_editorial` | API/search |
| Automotivo | 16h | `automotivo_editorial` | API/search |
| Games | 17h | `games_editorial` | API/search |
| TV e Áudio | 18h | `tv_audio_editorial` | API/search |
| Eletrodomésticos | 19h | `eletrodomesticos_editorial` | API/search |
| Móveis | 20h | `moveis_editorial` | API/search |
| Grandes Ofertas | 21h | `grandes_ofertas_editorial` | API/search/revalidação |
| Cupons | 22h | `cupons_aprovados_editorial` | cadastro manual |

O Oracle descobre a fila seguinte às 06h–21h. A fila de cupons não dispara busca automática. Os contratos carregam termos, aliases, bloqueios, atributos, prioridade, idade máxima e categorias/browse nodes por marketplace.

## Regras de segurança

- Uma oferta recebe uma intenção editorial principal.
- Ofertas sem classificação segura permanecem em revisão.
- `grandes_ofertas_editorial` aceita qualquer categoria, mas exige revalidação e idade máxima de duas horas.
- Cupons são exclusivamente manuais e precisam de código, regras e validade.
- A fila de publicação deve remover ofertas fora da idade máxima ou com preço/URL/estoque alterados.
