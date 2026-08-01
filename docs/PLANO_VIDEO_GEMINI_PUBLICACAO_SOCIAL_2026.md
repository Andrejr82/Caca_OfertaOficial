# Plano futuro — Vídeo Gemini → Google Drive → Facebook/Instagram

Status: documentado, não implementado.

## Objetivo

Permitir que um vídeo criado manualmente no Gemini seja armazenado no Google Drive e posteriormente incorporado ao fluxo editorial do Caça Oferta Oficial para geração de copy, revisão e publicação nas páginas oficiais do Facebook e Instagram.

## Fluxo pretendido

1. Selecionar uma oferta na página **Vídeos**.
2. Copiar o prompt estruturado e baixar/salvar a imagem do produto no Google Drive.
3. Gerar o vídeo no Gemini usando o avatar padrão, a imagem do produto e o prompt.
4. Salvar o vídeo final na pasta de vídeos do Google Drive.
5. No sistema, importar o vídeo do Drive e vinculá-lo à oferta selecionada.
6. Validar formato, proporção, duração, tamanho, direitos de uso e duplicidade.
7. Gerar automaticamente a copy V2 usando os dados verificados da oferta e o marketplace.
8. Criar drafts separados para Facebook e Instagram.
9. Exibir os drafts no painel para revisão humana.
10. Publicar somente após aprovação explícita, usando as APIs oficiais e os limites de cada canal.

## Componentes já disponíveis

- Prompt estruturado para Gemini.
- Download da imagem do produto.
- Upload direto da imagem para o Google Drive.
- Avatar padrão e regras de continuidade visual.
- Fluxo oficial de publicação Facebook/Instagram.
- Revisão e aprovação de drafts no painel.

## Pendências para concluir

- Importação segura de vídeo hospedado no Google Drive.
- OAuth/escopo de leitura do Drive para vídeos.
- Validação técnica do arquivo antes da publicação.
- Associação inequívoca entre vídeo, oferta e copy.
- Geração de copy específica para vídeo por canal.
- Preview do vídeo e copy no painel.
- Controle de idempotência, duplicidade e direitos de uso.
- Teste real com um vídeo Gemini antes de ativar qualquer automação.

## Regras de segurança

- Não publicar automaticamente ao importar o vídeo.
- Não gerar alegações que não estejam comprovadas pela oferta.
- Não reutilizar vídeo sem confirmação de autorização comercial.
- Manter o arquivo original no Drive e registrar sua origem.
- Facebook e Instagram permanecem sujeitos a cooldown, limites e aprovação manual.

## Critério de conclusão

O fluxo será considerado concluído quando um vídeo Gemini real for importado do Drive, vinculado à oferta correta, receber copy V2 válida, gerar drafts para Facebook e Instagram e for publicado com sucesso após aprovação manual.
