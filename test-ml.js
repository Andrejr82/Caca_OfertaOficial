const url = "https://http2.mlstatic.com/D_NQ_NP_667232-MLB72619047124_112023-V.webp";
async function test() {
  const oUrl = url.replace(/\.webp$/i, ".jpg").replace(/-[a-zA-Z]\.jpg$/i, "-O.jpg");
  const fUrl = url.replace(/\.webp$/i, ".jpg").replace(/-[a-zA-Z]\.jpg$/i, "-F.jpg");
  const sameUrl = url.replace(/\.webp$/i, ".jpg");
  const vUrl = url;

  for (const testUrl of [oUrl, fUrl, sameUrl, vUrl]) {
    try {
      const r = await fetch(testUrl, { method: "GET" });
      console.log(testUrl, r.status);
    } catch(e) { console.log(testUrl, e.message); }
  }
}
test();
