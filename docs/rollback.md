# Plano Oficial de Rollback (Reversão Segura)

A nova arquitetura desacoplada quebrou o funcionamento monolítico do script original. No entanto, por razões estritas de compatibilidade e *disaster recovery*, **o arquivo legado foi preservado e blindado**.

Se em qualquer momento a nova arquitetura (Scrape.do + LLM Factory) colapsar ou as APIs externas de terceiros sofrerem instabilidade generalizada, siga as etapas abaixo para ligar novamente o Monolito original.

## Como Executar o Rollback Imediato (Emergência)

1. Entre na pasta raiz do projeto.
2. Certifique-se que o pacote principal (`Playwright/Crawlee`) **não foi apagado** no seu `package.json`.
3. Abra um terminal isolado e rode o script oráculo de emergência:
   ```bash
   node scripts/oracle-scraper.cjs
   ```
4. O Oráculo vai:
   * Abrir o navegador Headless do Playwright e raspar localmente usando proxies do *Scrapfly*.
   * Fazer o upload das ofertas para o banco.
   * Acionar imediatamente a função `generateOfferAnalysis` legada (sem passar pela Factory).
   * Gerar posts e limpar lixo eletrônico.

## Critérios para Remoção Definitiva do Monolito

O `oracle-scraper.cjs` só perderá sua blindagem e será excluído do projeto (`git rm`) quando:
- A nova arquitetura rodar por no mínimo **72 horas sem intervenção humana**.
- O motor do Scrape.do demonstrar menor taxa de bloqueio (WAF) do que o motor do Playwright+Scrapfly.
- O Cérebro de Marketing (`ai-processor.cjs`) processar as ofertas com eficácia igual ou superior à função embutida original.

Após cumprir os requisitos, abra uma "Sprint de Limpeza Técnica" para arrancar as bibliotecas de Web Scraping massivo (`crawlee`, `playwright`, `puppeteer-extra-stealth`) do `package.json` e otimizar o bundle do projeto.
