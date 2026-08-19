# Tendências IA — correção de UX do refresh

Data: 2026-08-19

Problema observado: o botão `Solicitar Radar` registra a execução e chama `router.refresh()` imediatamente, antes da Oracle concluir. A tela continua exibindo o snapshot anterior, não acompanha o run solicitado e permite nova solicitação poucos segundos depois. Isso fez três execuções manuais serem abertas em sequência em 2026-08-19 17:49 BRT.

Correção definida:

- o POST continua apenas solicitando processamento na Oracle;
- o endpoint passa a expor GET de status por `runId` autenticado;
- o botão mantém estado `Solicitando/Processando` enquanto o run estiver `building`;
- polling leve consulta apenas o status do run já criado, sem criar novas execuções;
- ao concluir, a página chama `router.refresh()` automaticamente e mostra o novo snapshot;
- o botão fica bloqueado durante o processamento;
- a tela mostra ID e horário do último snapshot concluído;
- nenhuma alteração na Oracle é necessária para esta correção de UX.

A mudança deve ser consolidada em um único PR/deploy de Vercel.