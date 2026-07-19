require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function count() {
  const counts = {};
  let total = 0;
  let hasMore = true;
  let page = 0;
  const size = 1000;
  
  // Calcula o timestamp de 20 minutos atrás
  const recent = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('offers')
      .select('platform, status')
      .gte('updated_at', recent)
      .range(page * size, (page + 1) * size - 1);
      
    if (error) {
      console.error(error);
      return;
    }
    
    data.forEach(row => {
      const key = `${row.platform} | ${row.status}`;
      if (counts[key]) counts[key]++;
      else counts[key] = 1;
    });
    
    total += data.length;
    hasMore = data.length === size;
    page++;
  }
  
  console.log('--- Resumo de Status (Últimos 20 minutos por updated_at) ---');
  for (const [key, qty] of Object.entries(counts).sort()) {
    console.log(`${key}: ${qty}`);
  }
  console.log(`Total Geral: ${total}`);
}

count();
