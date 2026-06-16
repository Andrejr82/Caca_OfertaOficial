const fs = require('fs');

async function testInsert() {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const env = {};
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) env[key.trim()] = val.join('=').trim().replace(/"/g, '');
  });

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  // Test insert to posts table without affiliate_link_id
  const payload = {
    offer_id: "f94d96ec-7048-4ef5-91e0-bad1bd252018", // from previous output
    user_id: "7a9ca7b7-f464-46e0-a9de-9b322c73628a", // from previous output
    channel: "instagram",
    content: "Test caption",
    status: "published",
    external_id: "1234567890",
    posted_at: new Date().toISOString()
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/posts`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log("Insert response status:", res.status);
  console.log("Insert response body:", text);
}

testInsert();
