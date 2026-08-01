# Fluxo de vídeos Gemini → Drive → redes sociais

## Escopo de `/videos`

`/videos` trabalha somente com ofertas já existentes. Não há campo para colar links.

1. Selecionar a oferta e visualizar/baixar sua imagem.
2. Copiar o prompt estruturado para o Gemini Web.
3. Salvar o MP4 na pasta Google Drive configurada.
4. Listar e importar um vídeo da pasta.
5. Validar MP4, tamanho, duração e proporção vertical 9:16.
6. Copiar o arquivo para o bucket privado/público de vídeos do sistema.
7. Criar `video_job` com `template_id = gemini-drive-v1` e evidências de validação.
8. Gerar Copy V2 e drafts separados de Facebook e Instagram.
9. Exigir aprovação manual antes da publicação oficial.

O Instagram recebe legenda sem URL, direcionando para a bio/vitrine. O Facebook recebe a URL rastreada da publicação.

## Variáveis necessárias

```env
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
```

O refresh token é usado somente no servidor para renovar o access token em memória.

## Segurança e limites

- Nenhum vídeo é publicado automaticamente.
- A origem do vídeo deve ser a pasta Drive configurada.
- MP4, até 100 MB, 3–90 segundos e proporção vertical próxima de 9:16.
- O áudio é registrado como não verificado no servidor; o operador deve conferir a prévia antes da aprovação.
- O fluxo de links Shopee/Expressa permanece fora desta página.
