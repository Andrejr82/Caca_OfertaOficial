# Governança da documentação

<!-- docs-status: current -->
<!-- verified-against: dbf09b3 -->
<!-- verified-on: 2026-08-09 -->

## Autoridade

O código executável, as migrations, os testes e os manifestos de runtime têm precedência sobre a documentação. Os documentos canônicos explicam o estado comprovado no repositório; não comprovam que Vercel, Supabase, Oracle, PM2 ou provedores externos estejam implantados ou saudáveis.

## Documentos canônicos

- `README.md`: entrada e mapa do repositório.
- `docs/CURRENT_SYSTEM_STATUS.md`: resumo do estado versionado.
- `docs/architecture-current.md`: arquitetura e fluxos atuais.
- `docs/configuration.md`: configuração segura e flags operacionais.
- `docs/integracoes.md`: matriz de integrações e limites.
- `docs/deployment.md`: deploy, verificação e rollback.
- `docs/SECURITY.md`: fronteiras de confiança e controles.
- `docs/troubleshooting.md`: diagnóstico operacional.

Documentos em `docs/archive`, relatórios, planos, auditorias e snapshots são evidência histórica. Eles não substituem os documentos canônicos.

## Regra de atualização

Toda mudança que altere API, variável de ambiente, migration, integração, processo, scheduler, estado, canal ou procedimento de deploy deve atualizar o documento canônico correspondente no mesmo pull request. Cada documento canônico contém marcadores `docs-status`, `verified-against` e `verified-on`.

Antes do merge:

```bash
npm run docs:audit
npm run verify
```

`docs:audit` falha quando há commits de runtime posteriores ao último commit que atualizou cada documento. Em uma árvore de trabalho, um documento canônico modificado é tratado como atualização em revisão. O marcador `verified-against` registra a base efetivamente examinada e deve apontar para um ancestral válido.

## Conteúdo proibido

Nunca registrar valores de `.env`, tokens, cookies, chaves privadas, service-role keys, credenciais de marketplaces ou material de sessão. `.env.example` documenta apenas nomes, finalidade e exemplos não secretos.
