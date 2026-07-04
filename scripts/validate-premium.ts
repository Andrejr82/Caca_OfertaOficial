import { GET } from "../src/app/api/images/whatsapp-premium/route.js";
import fs from "fs";

async function run() {
  const ids = {
    amazon: "438270e7-76de-4f3c-9b05-108f73dea469",
    mercadolivre: "7e03967c-873e-4219-9e50-8ed6d5820d71",
    shopee: "e7baf992-f71e-4347-a580-c001a0406163",
    cupom: "96ba039d-7e35-4563-9459-6b2d6f8ef6ad"
  };

  for (const [name, id] of Object.entries(ids)) {
    const req = new Request(`http://localhost:3000/api/images/whatsapp-premium?offerId=${id}`);
    const res = await GET(req);
    const contentType = res.headers.get("content-type");
    const width = res.headers.get("x-whatsapp-premium-width");
    const height = res.headers.get("x-whatsapp-premium-height");
    const fallback = res.headers.get("x-whatsapp-premium-source") === "fallback" ? "SIM" : "NÃO";
    const bytes = res.headers.get("content-length");
    
    console.log(`--- ${name.toUpperCase()} ---`);
    console.log(`Status: ${res.status}`);
    console.log(`Content-Type: ${contentType}`);
    console.log(`Bytes: ${bytes}`);
    console.log(`Dimensions: ${width}x${height}`);
    console.log(`Fallback: ${fallback}`);

    if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(`.tmp-${name}-whatsapp-premium.jpg`, buffer);
    } else {
        const text = await res.text();
        console.log(`Error: ${text}`);
    }
  }
}
run();
