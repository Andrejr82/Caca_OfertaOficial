const fs = require('fs');

async function checkMismatch() {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const env = {};
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) env[key.trim()] = val.join('=').trim().replace(/"/g, '');
  });

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  console.log("Fetching recent Instagram posts...");
  const res = await fetch(`${supabaseUrl}/rest/v1/posts?channel=eq.instagram&order=created_at.desc&limit=5`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  const posts = await res.json();
  console.log(JSON.stringify(posts, null, 2));
  
  if (posts.length > 0) {
    for (const p of posts) {
      if (p.external_id === '1234567890') continue; // skip our mock
      console.log(`\nChecking affiliate links for offer ${p.offer_id}...`);
      const linkRes = await fetch(`${supabaseUrl}/rest/v1/affiliate_links?offer_id=eq.${p.offer_id}`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
      const links = await linkRes.json();
      console.log(`Found links channels:`, links.map(l => l.channel));
    }
  }
}

checkMismatch();
