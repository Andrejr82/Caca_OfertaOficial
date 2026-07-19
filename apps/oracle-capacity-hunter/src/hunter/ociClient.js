const common = require("oci-common");
const core = require("oci-core");
const identity = require("oci-identity");

class OciClient {
  constructor(config) {
    this.config = config;
    this.provider = null;
    this.computeClient = null;
  }

  initialize() {
    if (
      !this.config.ociTenancyId ||
      !this.config.ociUserId ||
      !this.config.ociFingerprint ||
      !this.config.ociPrivateKeyPath ||
      !this.config.ociRegion
    ) {
      throw new Error("OCI credentials are missing in the configuration.");
    }

    this.provider = new common.ConfigFileAuthenticationDetailsProvider(
      "./oci_config",
      "DEFAULT"
    );

    this.computeClient = new core.ComputeClient({
      authenticationDetailsProvider: this.provider
    });
  }

  async launchInstance(compartmentId, subnetId, imageId, shape) {
    if (!this.computeClient) {
      throw new Error("OCI Client is not initialized.");
    }

    const launchInstanceDetails = {
      compartmentId: compartmentId,
      availabilityDomain: await this.getAvailabilityDomain(compartmentId),
      shape: shape,
      displayName: `Hunter-Free-Tier-${new Date().getTime()}`,
      sourceDetails: {
        sourceType: "image",
        imageId: imageId
      },
      createVnicDetails: {
        subnetId: subnetId,
        assignPublicIp: true
      },
      shapeConfig: {
        ocpus: 4,
        memoryInGBs: 24
      }
    };

    try {
      const response = await this.computeClient.launchInstance({
        launchInstanceDetails
      });
      return { success: true, instance: response.instance };
    } catch (error) {
      // Retorna sucesso falso, sem quebrar o loop, repassando a mensagem de erro
      return { success: false, error: error.message || error };
    }
  }

  // Busca o primeiro Availability Domain do compartimento
  async getAvailabilityDomain(compartmentId) {
    const identityClient = new identity.IdentityClient({
      authenticationDetailsProvider: this.provider
    });
    
    // Identity endpoint geralmente é global ou baseado na região, o IdentityClient já lida com isso.
    const response = await identityClient.listAvailabilityDomains({
      compartmentId: this.config.ociTenancyId // Availability Domains são atrelados à Tenancy
    });

    if (response.items && response.items.length > 0) {
      // Por padrão, pega o primeiro. O ideal seria fazer fallback entre eles, mas vamos tentar no primeiro por enquanto.
      // Retorna o nome do AD (ex: "Uocm:SA-SAOPAULO-1-AD-1")
      return response.items[0].name;
    }
    
    throw new Error("No Availability Domains found for this Tenancy/Region.");
  }
  async getLatestUbuntuAarch64Image(compartmentId) {
    const response = await this.computeClient.listImages({
      compartmentId: compartmentId,
      operatingSystem: "Canonical Ubuntu",
      shape: "VM.Standard.A1.Flex",
      sortBy: "TIMECREATED",
      sortOrder: "DESC",
      limit: 10
    });
    
    const aarch64Images = response.items.filter(img => 
      img.operatingSystemVersion && img.operatingSystemVersion.includes('22.04') && img.operatingSystemVersion.includes('aarch64')
    );

    if (aarch64Images.length > 0) {
      return aarch64Images[0].id;
    }
    throw new Error("Nenhuma imagem Ubuntu 22.04 aarch64 encontrada para este compartimento/região.");
  }
}

module.exports = OciClient;
