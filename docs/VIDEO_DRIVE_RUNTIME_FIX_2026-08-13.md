# Vídeos de ofertas — correção do Google Drive em produção

Data: 2026-08-13

## Sintoma

A página `/videos` carregava normalmente, mas a chamada automática `GET /api/videos/drive` respondia repetidamente com HTTP 503 na produção da Vercel.

Nos logs analisados não houve resposta 200 desse endpoint no período observado. O endpoint convertia qualquer problema de configuração, renovação OAuth ou chamada da API do Google Drive no mesmo status 503, sem logar a causa no servidor.

## Causa técnica

`src/lib/videos/google-drive.ts` depende das variáveis server-side:

```env
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
```

As três primeiras são obrigatórias. `GOOGLE_DRIVE_FOLDER_ID` é opcional porque existe uma pasta oficial como fallback.

Antes desta correção, uma variável ausente gerava `GOOGLE_DRIVE_CONFIG_MISSING:*` e a rota `/api/videos/drive` convertia isso diretamente para 503. Uma credencial existente mas inválida/expirada também era indistinguível no log HTTP.

## Correção aplicada

### `src/lib/videos/google-drive.ts`

- adiciona `getGoogleDriveIntegrationStatus()` para validar configuração sem lançar exceção;
- lista exatamente quais variáveis obrigatórias estão ausentes;
- introduz `GoogleDriveIntegrationError` com códigos `missing_config`, `token_failed` e `drive_http`;
- mantém credenciais e tokens somente no servidor;
- melhora a mensagem de erro de renovação OAuth sem expor valores secretos.

### `src/app/api/videos/drive/route.ts`

- configuração ausente deixa de ser tratada como indisponibilidade do servidor;
- retorna HTTP 200 com `files: []` e estado `integration.status = missing_config`, evitando 503 recorrente ao simplesmente abrir `/videos`;
- falha real de OAuth/API passa a retornar 502 e registra `code`, status e mensagem no runtime da Vercel;
- autenticação da aplicação continua obrigatória.

### Testes

`src/tests/videos/google-drive.test.ts` valida:

- detecção das três variáveis OAuth ausentes;
- fallback da pasta oficial;
- configuração completa;
- preservação de `GOOGLE_DRIVE_FOLDER_ID` customizado.

## Ação operacional necessária

A correção torna a página resiliente e diagnóstica, mas listar/importar vídeos exige OAuth Google Drive válido no ambiente **Production** da Vercel.

Confirmar no projeto `caca-oferta-oficial` que existem, em Production:

```env
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_REFRESH_TOKEN
```

E, se a pasta usada não for a oficial de fallback:

```env
GOOGLE_DRIVE_FOLDER_ID
```

Depois de qualquer criação ou alteração de variável de ambiente na Vercel, realizar novo deployment para que a função receba os valores atualizados.

## Como interpretar o próximo log

Após deploy:

- `GET /api/videos/drive 200` + arquivos: integração funcional;
- `GET /api/videos/drive 200` + `missing_config`: faltam variáveis OAuth na Vercel;
- `GET /api/videos/drive 502` + log `token_failed`: client/secret/refresh token existem, mas a autorização OAuth precisa ser renovada;
- `GET /api/videos/drive 502` + log `drive_http`: OAuth funcionou, mas a API do Drive recusou a consulta (por exemplo, acesso à pasta).

## Logs `/api/inngest`

Os HTTP 500 observados em `/api/inngest` ocorrem em cadência de aproximadamente cinco minutos, compatível com o cron `publish-telegram-editorial-top30` (`*/5 * * * *`). Esse fluxo é independente da página `/videos` e não foi alterado nesta correção para evitar misturar uma falha de automação Telegram com a integração Google Drive.
