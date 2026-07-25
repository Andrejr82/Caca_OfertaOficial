const url = "https://meli.la/1uQ6YYf";

async function testMethod(method: string) {
  const resp = await fetch(url, {
    method,
    redirect: "manual",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  console.log(`Method: ${method} -> Status: ${resp.status} Location: ${resp.headers.get("location")}`);
}

async function run() {
  await testMethod("HEAD");
  await testMethod("GET");
}

run();
