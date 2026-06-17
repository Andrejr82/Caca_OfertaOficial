import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("Deletando posts...");
  let res1 = await fetch(`${url}/rest/v1/posts?id=not.is.null`, {
    method: 'DELETE',
    headers: {
      'apikey': key!,
      'Authorization': `Bearer ${key}`
    }
  });
  console.log("Status 1:", res1.status);

  console.log("Deletando offers...");
  let res2 = await fetch(`${url}/rest/v1/offers?id=not.is.null`, {
    method: 'DELETE',
    headers: {
      'apikey': key!,
      'Authorization': `Bearer ${key}`
    }
  });
  console.log("Status 2:", res2.status);
  console.log("Tudo limpo!");
}
run();
