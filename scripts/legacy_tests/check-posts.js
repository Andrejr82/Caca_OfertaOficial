const fs = require('fs');

async function checkPosts() {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const env = {};
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) env[key.trim()] = val.join('=').trim().replace(/"/g, '');
  });

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  console.log("Fetching recent Instagram posts from Supabase...");
  const res = await fetch(`${supabaseUrl}/rest/v1/posts?channel=eq.instagram&order=posted_at.desc&limit=5`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  const data = await res.json();
  console.log("Recent Instagram posts:", JSON.stringify(data, null, 2));

  if (data.length > 0) {
    const offerId = data[0].offer_id;
    console.log("\nChecking affiliate link for offer:", offerId);
    const linkRes = await fetch(`${supabaseUrl}/rest/v1/affiliate_links?offer_id=eq.${offerId}&channel=eq.instagram`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const linkData = await linkRes.json();
    console.log("Affiliate link data:", JSON.stringify(linkData, null, 2));
  }
}

checkPosts();
