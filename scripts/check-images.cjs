const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

global.WebSocket = require('ws');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function checkImages() {
  const { data: offers, error } = await supabase
    .from('offers')
    .select('id, product_name, image_url')
    .eq('status', 'approved')
    .limit(5);
    
  if (error) {
    console.error(error);
    return;
  }
  
  for (const o of offers) {
    console.log(`[${o.id}] ${o.product_name.substring(0,20)} -> ${o.image_url.substring(0,60)}...`);
  }
}

checkImages();
