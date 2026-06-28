require('dotenv').config({path: '.env.local'});
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { webSocketImpl: ws },
});

async function run() {
  const { data: logs, error } = await supabase.from('integration_logs')
    .select('*')
    .eq('integration', 'Oracle-Scraper')
    .order('created_at', { ascending: false })
    .limit(500);
    
  if (error) {
    console.error(error);
    return;
  }
  
  let totalScraped = 0;
  let totalAiProcessed = 0;
  let successCount = 0;
  
  logs.forEach(log => {
    if (log.metadata) {
      totalScraped += (log.metadata.total_scraped || 0);
      totalAiProcessed += (log.metadata.ai_processed || 0);
      successCount++;
    }
  });
  
  console.log(JSON.stringify({ totalScraped, totalAiProcessed, count: logs.length }, null, 2));
}
run();
