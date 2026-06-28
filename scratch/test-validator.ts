import { validateProduct } from "../src/core/scraper/product-validator";
import { validateHtml } from "../src/core/scraper/html-validator";

console.log("=== ETAPA 6: PRODUTO INVÁLIDO ===");
const fakeProduct = {
  title: "Produto 1",
  image: null,
  price: 99.90,
  url: ""
};
const resProduct = validateProduct(fakeProduct, "TEST");
console.log(resProduct);

console.log("\n=== ETAPA 7: HTML INVÁLIDO ===");
const fakeHtml = "<html><body>Please Verify you are human to access this store</body></html>";
const resHtml = validateHtml(fakeHtml, "TEST");
console.log("HTML Valid?", resHtml);
