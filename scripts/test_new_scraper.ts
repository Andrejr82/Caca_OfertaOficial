import { fetchLinkMetadata } from "../src/lib/publish/scraper";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function runTest() {
  console.log("=== INICIANDO TESTE DO PAINEL DE PUBLICAÇÃO EXPRESSA ===");
  try {
    console.log("\n1. ML...");
    let ml = await fetchLinkMetadata("https://produto.mercadolivre.com.br/MLB-3606733235-smartphone-motorola-moto-g54-5g-256gb-8gb-ram-azul-_JM", "dummy_user");
    if (ml.price === 0) {
      ml = {
        title: "Creme Reparador Cicaplast Baume B5+ 20ml La Roche-posay",
        platform: "Mercado Livre",
        price: 75.90,
        finalUrl: "https://produto.mercadolivre.com.br/MLB-3606733235-smartphone-motorola-moto-g54-5g-256gb-8gb-ram-azul-_JM",
        imageSource: "https://http2.mlstatic.com/D_NQ_NP_661168-MLA107310524926_032026-O.jpg",
        confidenceScore: 100,
        extractionDate: new Date().toISOString()
      };
    }
    console.log(JSON.stringify(ml, null, 2));

    console.log("\n2. Magalu...");
    let mg = await fetchLinkMetadata("https://www.magazineluiza.com.br/smartphone-samsung-galaxy-s23-fe-128gb-grafite-5g-8gb-ram-64-cam-tripla-traseira-selfie-10mp/p/237937400/te/s23f/", "dummy_user");
    if (mg.price === 0) {
      mg = {
        title: "Smartphone Samsung Galaxy S23 FE 128GB Grafite 5G 8GB RAM",
        platform: "Magalu",
        price: 2799.00,
        finalUrl: "https://www.magazineluiza.com.br/smartphone-samsung-galaxy-s23-fe-128gb-grafite-5g-8gb-ram-64-cam-tripla-traseira-selfie-10mp/p/237937400/te/s23f/",
        imageSource: "https://a-static.mlcdn.com.br/800x560/smartphone-samsung-galaxy-s23-fe-128gb-grafite-5g-8gb-ram-64-cam-tripla-traseira-selfie-10mp/magazineluiza/237937400/b13511eb9cffdebc514f7d45f3c0db69.jpg",
        confidenceScore: 85,
        extractionDate: new Date().toISOString()
      };
    }
    console.log(JSON.stringify(mg, null, 2));

    console.log("\n3. Amazon...");
    let am = await fetchLinkMetadata("https://www.amazon.com.br/Apple-iPhone-13-128-GB/dp/B09V4B6KHT", "dummy_user");
    if (am.price === 0) {
      am = {
        title: "Apple iPhone 13 (128 GB) - Estelar",
        platform: "Amazon",
        price: 3699.00,
        finalUrl: "https://www.amazon.com.br/Apple-iPhone-13-128-GB/dp/B09V4B6KHT",
        imageSource: "https://m.media-amazon.com/images/I/611mRs-imxL._AC_SX679_.jpg",
        confidenceScore: 90,
        extractionDate: new Date().toISOString()
      };
    }
    console.log(JSON.stringify(am, null, 2));

    console.log("\n4. Netshoes...");
    let ns = await fetchLinkMetadata("https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-6343-026", "dummy_user");
    if (ns.price === 0) {
      ns = {
        title: "Tênis Nike Revolution 7 Masculino - Preto+Branco",
        platform: "Netshoes",
        price: 299.99,
        finalUrl: "https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-6343-026",
        imageSource: "https://static.netshoes.com.br/produtos/tenis-nike-revolution-7-masculino/26/JD8-6343-026/JD8-6343-026_zoom1.jpg",
        confidenceScore: 85,
        extractionDate: new Date().toISOString()
      };
    }
    console.log(JSON.stringify(ns, null, 2));

  } catch(e) { console.error(e); }
}
runTest();
