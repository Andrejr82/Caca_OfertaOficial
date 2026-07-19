require('dotenv').config();
const common = require("oci-common");
const core = require("oci-core");

async function findImage() {
  const provider = new common.SimpleAuthenticationDetailsProvider(
    process.env.OCI_TENANCY_ID,
    process.env.OCI_USER_ID,
    process.env.OCI_FINGERPRINT,
    process.env.OCI_PRIVATE_KEY_PATH,
    null,
    common.Region.fromRegionId(process.env.OCI_REGION)
  );

  const computeClient = new core.ComputeClient({ authenticationDetailsProvider: provider });

  console.log("Buscando imagens do Ubuntu 22.04 aarch64 no compartimento...");
  
  try {
    const response = await computeClient.listImages({
      compartmentId: process.env.OCI_COMPARTMENT_ID,
      operatingSystem: "Canonical Ubuntu",
      shape: "VM.Standard.A1.Flex",
      sortBy: "TIMECREATED",
      sortOrder: "DESC",
      limit: 5
    });

    const aarch64Images = response.items.filter(img => 
      img.operatingSystemVersion && img.operatingSystemVersion.includes('22.04') && img.operatingSystemVersion.includes('aarch64')
    );

    if (aarch64Images.length > 0) {
      console.log("SUCESSO! O IMAGE_ID encontrado é:");
      console.log(aarch64Images[0].id);
    } else {
      console.log("Nenhuma imagem exata encontrada, listando as últimas disponíveis para A1.Flex:");
      response.items.forEach(img => {
        console.log(`OS: ${img.operatingSystem} ${img.operatingSystemVersion} -> ID: ${img.id}`);
      });
    }
  } catch (error) {
    console.error("Erro ao buscar a imagem:", error.message);
  }
}

findImage();
