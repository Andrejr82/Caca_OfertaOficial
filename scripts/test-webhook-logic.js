const fs = require('fs');

async function testLogic() {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const env = {};
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) env[key.trim()] = val.join('=').trim().replace(/"/g, '');
  });

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  const mediaId = "17907580236431118";

  console.log("Looking for post with mediaId", mediaId);
  const postRes = await fetch(`${supabaseUrl}/rest/v1/posts?channel=eq.instagram&external_id=eq.${mediaId}&select=*,offers(*)`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const postsData = await postRes.json();
  const post = postsData[0];

  if (!post || !post.offers) {
    console.log("No post or offers found!");
    return;
  }

  console.log("Post found!", post.id);
  console.log("Looking for affiliate link for offer", post.offers.id);

  const linkRes = await fetch(`${supabaseUrl}/rest/v1/affiliate_links?offer_id=eq.${post.offers.id}&channel=eq.instagram`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const linkData = await linkRes.json();
  const linkRecord = linkData[0];

  if (!linkRecord) {
    console.log("No affiliate link found!");
    return;
  }

  console.log("Link found!", linkRecord.id);
  
  // Test sending the reply!
  const igUserId = "17841400262143048"; // From user's previous webhook logs or whatever, we don't have it.
  // We can't actually send a test reply because we don't have the commentId!
  console.log("Everything up to sendPrivateReply is correct.");
}

testLogic();
