require('dotenv').config();
const logger = require('../logger/logger');
const telegramService = require('../telegram/bot');
const OciClient = require('./ociClient');

// Lê as configurações diretamente do process.env
const config = {
  ociTenancyId: process.env.OCI_TENANCY_ID,
  ociUserId: process.env.OCI_USER_ID,
  ociFingerprint: process.env.OCI_FINGERPRINT,
  ociPrivateKeyPath: process.env.OCI_PRIVATE_KEY_PATH,
  ociRegion: process.env.OCI_REGION,
  ociCompartmentId: process.env.OCI_COMPARTMENT_ID,
  subnetId: process.env.SUBNET_ID,
  imageId: process.env.IMAGE_ID,
  shape: process.env.SHAPE || 'VM.Standard.A1.Flex',
  intervalMinutes: parseInt(process.env.HUNTER_INTERVAL_MINUTES, 10) || 5,
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runHunter() {
  logger.info("🟢 Inicializando Oracle Capacity Hunter (OCI SDK)...");

  // Validação básica
  const requiredKeys = [
    'ociTenancyId', 'ociUserId', 'ociFingerprint', 'ociPrivateKeyPath',
    'ociRegion', 'ociCompartmentId', 'subnetId'
  ];
  const missing = requiredKeys.filter(k => !config[k]);
  
  if (missing.length > 0) {
    const errorMsg = `🚨 Hunter interrompido. Faltam configurações no .env: ${missing.join(', ')}`;
    logger.error(errorMsg);
    await telegramService.sendMessage(`<b>[OCI HUNTER]</b> Falha ao iniciar: Faltam configurações de credenciais.`);
    process.exit(1);
  }

  const client = new OciClient(config);
  
  try {
    client.initialize();
  } catch (err) {
    logger.error(`🚨 Falha ao inicializar OCI Client: ${err.message}`);
    process.exit(1);
  }

  if (!config.imageId) {
    logger.info("IMAGE_ID não configurado. Buscando a imagem Ubuntu 22.04 aarch64 mais recente...");
    try {
      config.imageId = await client.getLatestUbuntuAarch64Image(config.ociCompartmentId);
      logger.info(`✅ Imagem encontrada automaticamente: ${config.imageId}`);
    } catch (err) {
      logger.error(`🚨 Erro ao buscar imagem automaticamente: ${err.message}`);
      await telegramService.sendMessage(`<b>[OCI HUNTER]</b> Falha ao buscar imagem automaticamente: ${err.message}`);
      process.exit(1);
    }
  }

  logger.info(`🔍 Procurando por capacidade da shape ${config.shape} em ${config.ociRegion}...`);
  await telegramService.sendMessage(`<b>[OCI HUNTER]</b> 🟢 Caçador de capacidade iniciado. Procurando <b>${config.shape}</b> em <code>${config.ociRegion}</code> a cada ${config.intervalMinutes} minutos.`);

  let attempt = 1;
  const intervalMs = config.intervalMinutes * 60 * 1000;

  while (true) {
    try {
      logger.info(`Tentativa #${attempt} - Chamando API da Oracle...`);
      const result = await client.launchInstance(
        config.ociCompartmentId,
        config.subnetId,
        config.imageId,
        config.shape
      );

      if (result.success) {
        const msg = `🎉 <b>[OCI HUNTER] SUCESSO ABSOLUTO!</b> 🎉\n\n` +
                    `Instância criada!\n` +
                    `<b>ID:</b> <code>${result.instance.id}</code>\n` +
                    `<b>Region:</b> ${result.instance.region}\n` +
                    `<b>AD:</b> ${result.instance.availabilityDomain}\n` +
                    `Acesse o painel da Oracle para configurá-la. O Hunter será encerrado.`;
        
        logger.info(msg);
        await telegramService.sendMessage(msg);
        break; // Sucesso, paramos o loop!
      } else {
        const errLower = result.error.toString().toLowerCase();
        // A Oracle costuma retornar 500 Out of host capacity
        if (errLower.includes('out of host capacity') || errLower.includes('capacity')) {
          logger.info(`Tentativa #${attempt} falhou: Sem capacidade no momento. Tentando novamente em ${config.intervalMinutes}m.`);
        } else if (errLower.includes('limit exceeded') || errLower.includes('limitexceeded')) {
          logger.error(`Tentativa #${attempt} falhou: Limite de cota excedido. (Você já atingiu o limite de instâncias gratuitas?)`);
          await telegramService.sendMessage(`<b>[OCI HUNTER]</b> ⚠️ Erro: Limite excedido na Oracle (LimitExceeded). O script vai continuar tentando, mas verifique sua conta.`);
        } else {
          logger.error(`Tentativa #${attempt} falhou por erro desconhecido: ${result.error}`);
        }
      }
    } catch (err) {
      logger.error(`Erro crítico no loop de tentativa: ${err.message}`);
    }

    // Esperar o tempo determinado antes de tentar de novo
    await sleep(intervalMs);
    attempt++;
  }
}

// Inicia o processo
runHunter();
