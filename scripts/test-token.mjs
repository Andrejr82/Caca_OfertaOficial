import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const GRAPH_API_VERSION = "v19.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const token = process.env.INSTAGRAM_ACCESS_TOKEN;

async function run() {
  const url = `${BASE_URL}/me/permissions?access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log("Permissões contidas no Token Atual:");
  if (data.data) {
    data.data.forEach(p => {
      console.log(`- ${p.permission}: ${p.status}`);
    });
  } else {
    console.log(data);
  }
}
run();
