require('dotenv').config();

module.exports = {
  oci: {
    tenancyOcid: process.env.OCI_TENANCY_OCID,
    userOcid: process.env.OCI_USER_OCID,
    fingerprint: process.env.OCI_FINGERPRINT,
    privateKeyPath: process.env.OCI_PRIVATE_KEY_PATH,
    region: process.env.OCI_REGION,
    compartmentOcid: process.env.OCI_COMPARTMENT_OCID,
    subnetOcid: process.env.OCI_SUBNET_OCID,
    availabilityDomain: process.env.OCI_AVAILABILITY_DOMAIN,
    imageOcid: process.env.OCI_IMAGE_OCID,
    shape: process.env.OCI_SHAPE || 'VM.Standard.A1.Flex',
    ocpus: parseFloat(process.env.OCI_OCPUS) || 4,
    memoryInGBs: parseFloat(process.env.OCI_MEMORY_GB) || 24,
  },
  checkIntervalMs: (parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5) * 60 * 1000,
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    sendAlerts: process.env.SEND_TELEGRAM_ALERTS === 'true',
  },
  autoCreate: process.env.AUTO_CREATE_INSTANCE === 'true',
  logsEnabled: process.env.ENABLE_LOGS !== 'false',
  reportsEnabled: process.env.ENABLE_REPORTS !== 'false',
};
