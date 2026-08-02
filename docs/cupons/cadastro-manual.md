# Cadastro manual de cupons

## Objetivo

Registrar cupons copiados da Central de Afiliados do marketplace e preparar a oferta para revisão manual, com links rastreados e drafts sociais.

O sistema não inventa cupons nem consulta fontes não autorizadas. O código, benefício, regras, validade e link devem ser conferidos pelo operador na fonte oficial.

## Onde cadastrar

1. Acesse **Dashboard → Motor de Cupons**.
2. Selecione **Mercado Livre**, **Shopee** ou **Amazon**.
3. Preencha o formulário **Cadastrar cupom manualmente**.

## Campos

| Campo | Preenchimento | Exemplo |
|---|---|---|
| Marketplace | Selecione o marketplace onde o cupom pode ser resgatado. | Mercado Livre |
| Código do cupom | Copie exatamente o código oficial, preservando letras, números e símbolos. | OFERTA20 |
| Benefício | Informe o desconto ou vantagem exibida na fonte oficial. | R$ 20 OFF / 10% de desconto / Frete grátis |
| Validade | Copie o prazo informado oficialmente. | até 31/08/2026 |
| Link oficial | Cole o link original do marketplace ou da Central de Afiliados. Não use um link `caca-oferta-oficial.vercel.app`. | `https://www.mercadolivre.com.br/...` |
| Imagem do produto | Opcional. Use uma URL pública direta da imagem. | `https://.../produto.jpg` |
| Regras de uso | Informe condições, como valor mínimo, categoria, vendedor, forma de pagamento ou limite de uso. | válido acima de R$ 100, limitado a um uso por cliente |

## Exemplo

```text
Marketplace: Mercado Livre
Código: OFERTA20
Benefício: R$ 20 OFF
Validade: até 31/08/2026
Link: https://www.mercadolivre.com.br/...
Regras: válido para compras acima de R$ 100, limitado a um uso por cliente
Imagem: opcional
```

## Validações aplicadas

- Marketplace limitado a Mercado Livre, Shopee e Amazon.
- Código, benefício, validade, regras e link são obrigatórios.
- O domínio do link precisa corresponder ao marketplace selecionado.
- A imagem, quando informada, precisa usar URL HTTP ou HTTPS.
- Link rastreado antigo não deve ser colado; o sistema gera os links de canal.

## O que acontece depois de cadastrar

1. A oferta é criada em revisão manual.
2. O cupom é persistido com suas regras e validade.
3. São criados links rastreados por canal.
4. São preparados drafts para Instagram, Telegram e WhatsApp.
5. A publicação continua bloqueada até aprovação manual.

## Observações

- Cupom sem código não é aceito neste formulário.
- Não transformar promoção automática em cupom.
- Não alterar o valor, a validade ou as regras copiadas da fonte oficial.
- A disponibilidade e as condições podem mudar no marketplace; revise antes de aprovar o draft.
