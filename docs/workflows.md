# Fluxos Operacionais (Workflows)

Esta documentação descreve as principais trilhas do usuário (Jornadas) desde o momento da curadoria da oferta até o pós-venda.

## Workflow de Cadastro e Geração de Rascunho

1. **Entrada de Dados:** O Operador copia a URL bruta de uma oferta de marketplace (Shopee, Amazon).
2. **Scraping Raw:** Ele entra no painel, aba "Publicar Oferta". O sistema busca os metadados dessa oferta (Nome, Preço de R$ 100 para R$ 80, Categoria).
3. **Trigger da Inteligência Artificial:** Ao apertar "Gerar Textos", a requisição bate na `POST /api/ai/generate`.
4. **Resolução de Rastreamento (SubIDs):** O backend imediatamente atrela aquela `offer_id` aos canais habilitados no painel do usuário e gera os `SubIDs` da UTM. Ele aciona o motor gerador das URLs em formato "Shopee Affiliates" por exemplo.
5. **Geração Mágica:** O Groq/Gemini processa os metadados do passo 2 sob o Prompt Restrito de Gatilhos. Ele devolve o JSON.
6. **Gravação e Retorno:** Os posts são salvos em estado "Rascunho" na base de dados. A resposta volta para o Dashboard listando 4 opções de botões.

## Workflow de Disparo ao Vivo (Publishing)

1. **Aprovação Manual (MVP):** O usuário lê as opções geradas pela IA no painel e clica em "Postar esta Copy".
2. **Roteamento:** A requisição é feita pro `POST /api/publish/[canal]`.
3. **Se Telegram:** 
   - Backend carrega a foto original e o texto formatado.
   - Dispara na Telegram Bot API em milisegundos.
4. **Se WhatsApp:**
   - O Backend joga o ID da oferta numa "Fila Temporária no Banco" (ex: mudando o status na tabela `posts`).
   - O Worker Node (`whatsapp-engine.cjs`) rodando na máquina que está conectada com o QRCode está sondando (polling) o banco de dados a cada N segundos ou ouvindo Webhooks Inngest.
   - Ele baixa o texto, a foto, processa na engine `baileys` e faz o envio.
5. **Logs:** A coluna `status` de todas as mensagens na tabela `posts` muda de "draft" para "published".
