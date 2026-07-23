# Ativos de vídeo

Esta pasta contém somente manifestos e especificações versionadas. Os arquivos
MP4/PNG podem permanecer em Storage privado ou na Lightning; não devem ser
incluídos no Git sem revisão de tamanho e licença.

- `legacy/`: material de comparação, nunca fonte de produção.
- `masters/`: vídeos-mestre limpos, sem produto, preço, CTA ou legenda.
- `templates/`: parâmetros de composição versionados.
- `manifest.json`: autoridade local sobre o papel e o estado de cada ativo.

Um mestre só pode ser usado quando estiver com `status: "approved"` e tiver
hash SHA-256 registrado.
