# Instruções do projeto — Caça Oferta Oficial

## Controle de mudanças

Você está operando em um sistema com integrações de produção. Trabalhe em modo somente leitura por padrão. Nenhum arquivo, banco, ambiente, servidor, fila, canal social ou repositório pode ser alterado sem aprovação explícita do proprietário.

Antes de qualquer ação mutável, apresente:

- objetivo;
- arquivos e serviços afetados;
- riscos;
- testes;
- rollback;
- comando ou diff que será executado.

Depois aguarde aprovação clara e específica.

## Skills obrigatórias de referência

- Caveman: https://github.com/JuliusBrussee/caveman.git
- Superpowers: https://github.com/obra/superpowers.git

As referências devem orientar diagnóstico, execução disciplinada, validação e comunicação objetiva. Não instalar ou atualizar skills sem autorização.

## Permitido sem aprovação

- inspeção de arquivos e histórico;
- busca por referências no código;
- leitura de logs;
- consulta a documentação oficial;
- testes locais que não escrevam dados nem acessem produção de forma mutável;
- elaboração de plano, matriz de riscos e diff proposto.

## Proibido sem aprovação

- editar ou excluir arquivos;
- criar ou aplicar migrações;
- alterar Supabase, Oracle Cloud, PM2 ou Vercel;
- executar ciclos, scrapers ou workers de produção;
- enviar ou publicar mensagens em qualquer rede social;
- alterar credenciais, tokens, OAuth ou `.env.local`;
- commit, push, merge, rebase ou deploy;
- instalar dependências ou executar scripts de instalação;
- fazer backfill, reset, purge ou exclusão em massa;
- contornar limites, bloqueios ou políticas de terceiros.

## Credenciais e dados sensíveis

Nunca revele ou registre valores de:

- access token;
- refresh token;
- client secret;
- API key;
- cookie de sessão;
- chave SSH;
- QR code de autenticação.

Use apenas presença, validade, escopo e status mascarados. Não persista tokens renovados.

## Procedimento seguro

1. Confirmar o pedido e o escopo.
2. Fazer diagnóstico baseado em evidências.
3. Procurar primeiro a causa no código e na configuração atual.
4. Propor a menor alteração necessária.
5. Solicitar aprovação explícita.
6. Implementar somente o escopo aprovado.
7. Executar testes proporcionais ao risco.
8. Verificar diffs, logs, hashes e estado dos serviços.
9. Relatar o que mudou e o que permaneceu intacto.

## Regra de publicação

Nenhuma publicação automática deve ser ativada durante análise ou desenvolvimento. Aprovação manual, deduplicação, revalidação de preço/URL e pausa emergencial devem permanecer preservadas.

## Comunicação

Não invente resultados. Diferencie “verificado”, “inferido”, “não encontrado” e “não executado”. Se a autorização estiver ambígua, não agir.
