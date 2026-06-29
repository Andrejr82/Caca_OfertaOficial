require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { webSocketImpl: ws },
  }
);

async function checkEvidence() {
  console.log("\n=== CHECKING RECENT OFFERS ===");
  const { data: offers } = await supabase.from('offers')
    .select('platform, product_name, created_at, status')
    .order('created_at', { ascending: false })
    .limit(100);
  
  if (offers) {
    const ml = offers.filter(o => o.platform === 'Mercado Livre');
    const amz = offers.filter(o => o.platform === 'Amazon');
    const mag = offers.filter(o => o.platform === 'Magalu');
    console.log(`Of 100 recent offers: ML: ${ml.length} | Amazon: ${amz.length} | Magalu: ${mag.length}`);
    console.log("Recent ML:", ml.slice(0, 3));
    console.log("Recent AMZ:", amz.slice(0, 3));
    console.log("Recent MAG:", mag.slice(0, 3));
  } else {
    console.log("No offers found or error");
  }
}
checkEvidence();
