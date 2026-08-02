# Instruções do projeto — Caça Oferta Oficial

## Regra principal

Este arquivo define o comportamento obrigatório do Gemini neste repositório. Nenhuma alteração pode ser feita sem aprovação explícita do proprietário nesta conversa.

“Aprovar”, “pode fazer”, “prossiga” ou equivalente deve se referir claramente à ação proposta. Na dúvida, parar e pedir confirmação.

## Skills de referência

Usar, quando aplicável, as seguintes referências:

- Caveman: https://github.com/JuliusBrussee/caveman.git
- Superpowers: https://github.com/obra/superpowers.git

Não clonar, instalar, atualizar ou substituir essas skills sem aprovação explícita.

## Modo padrão: somente leitura

Antes de aprovação específica, é permitido apenas:

- ler arquivos;
- pesquisar no repositório;
- analisar código, logs e configurações;
- consultar documentação oficial;
- propor diagnóstico, plano e diff conceitual;
- executar testes não destrutivos e sem efeitos externos.

## Ações proibidas sem aprovação explícita

Não executar:

- edição, criação ou exclusão de arquivos;
- alteração de `.env`, `.env.local` ou secrets;
- alteração de banco, Supabase ou dados de produção;
- execução de ciclos Oracle;
- reinício ou alteração de PM2;
- publicação em Telegram, Facebook, Instagram ou WhatsApp;
- deploy na Vercel ou Oracle Cloud;
- commit, push, merge, rebase ou criação de branch;
- instalação de dependências;
- rotação ou exposição de tokens;
- chamadas externas que criem, publiquem ou modifiquem dados;
- exclusões, migrações ou backfills.

## Segurança e credenciais

- Nunca exibir tokens, secrets, cookies, QR codes, refresh tokens ou chaves privadas.
- Mascarar credenciais em logs e relatórios.
- Não copiar secrets entre ambientes.
- Não persistir tokens temporários.
- Usar somente o escopo mínimo necessário.

## Método obrigatório

1. Identificar objetivo e escopo.
2. Inspecionar o estado atual.
3. Informar arquivos, riscos e dependências.
4. Propor a alteração mínima.
5. Aguardar aprovação explícita.
6. Executar somente o que foi aprovado.
7. Testar e apresentar evidências.
8. Não declarar conclusão sem validação real.

## Regras de integridade

- Preservar alterações existentes do usuário.
- Não alterar comportamento fora do escopo aprovado.
- Não substituir uma integração por outra sem autorização.
- Não ativar automação de publicação por padrão.
- Manter fallback manual e rollback documentado.
- Toda alteração deve indicar arquivos afetados, testes executados e efeitos externos.

## Resposta esperada

Ser objetivo, separar fatos de hipóteses e declarar claramente quando algo não foi executado. Em tarefas de análise, não implementar a solução.
