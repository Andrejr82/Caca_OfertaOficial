const common = require('oci-common');
const core = require('oci-core');
const config = require('../utils/config');
const logger = require('../logger/logger');

class OracleClient {
  constructor() {
    // Only initialize if we have the configuration
    if (config.oci.tenancyOcid) {
      try {
        this.provider = new common.ConfigFileAuthenticationDetailsProvider(
          null,
          null,
          config.oci.tenancyOcid,
          config.oci.userOcid,
          config.oci.fingerprint,
          config.oci.privateKeyPath,
          config.oci.region
        );
        this.computeClient = new core.ComputeClient({ authenticationDetailsProvider: this.provider });
      } catch (e) {
        logger.error(`Erro ao inicializar provider da OCI: ${e.message}`);
      }
    }
  }

  async checkCapacity() {
    logger.info('Verificando capacidade na Oracle Cloud...');
    try {
      // Mocked response para evitar execução real durante fase de implementação/SAFE MODE.
      const responseStatus = 'OutOfHostCapacity'; 
      const result = this.parseResponse(responseStatus);
      return result;
    } catch (error) {
      const result = this.parseError(error);
      return result;
    }
  }

  parseResponse(status) {
    switch(status) {
      case 'CapacityAvailable':
        return { status: 'AVAILABLE', details: 'Capacidade encontrada para a instância solicitada!' };
      case 'OutOfHostCapacity':
        return { status: 'OUT_OF_CAPACITY', details: 'Host capacity out.' };
      default:
        return { status: 'UNKNOWN', details: `Status desconhecido: ${status}` };
    }
  }

  parseError(error) {
    if (error.message && error.message.includes('QuotaExceeded')) {
      return { status: 'QUOTA_EXCEEDED', details: 'A cota para este shape foi excedida.' };
    }
    if (error.message && error.message.includes('ShapeUnavailable')) {
      return { status: 'SHAPE_UNAVAILABLE', details: 'O shape solicitado não está disponível.' };
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return { status: 'AUTH_ERROR', details: 'Erro de autenticação com a OCI.' };
    }
    if (error.message && error.message.includes('Timeout')) {
      return { status: 'TIMEOUT', details: 'Tempo limite excedido na comunicação com a OCI.' };
    }
    
    return { status: 'ERROR', details: `Erro não tratado: ${error.message}` };
  }
}

module.exports = new OracleClient();
