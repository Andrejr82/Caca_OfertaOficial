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
    .in('action', ['BATCH_SUMMARY', 'REJECT', 'SUCCESS'])
    .order('created_at', { ascending: false })
    .limit(1000);
    
  if (error) {
    console.error(error);
    return;
  }
  
  let rejectReasons = {};
  let totalFound = 0;
  let totalApproved = 0;
  let totalRejected = 0;
  
  logs.forEach(log => {
    if (log.action === 'BATCH_SUMMARY' && log.metadata) {
       totalFound += (log.metadata.found || 0);
       totalApproved += (log.metadata.approved || 0);
       totalRejected += (log.metadata.rejected || 0);
       if (log.metadata.rejectStats) {
         for (const [reason, count] of Object.entries(log.metadata.rejectStats)) {
           rejectReasons[reason] = (rejectReasons[reason] || 0) + count;
         }
       }
    }
  });
  
  console.log(JSON.stringify({ totalFound, totalApproved, totalRejected, rejectReasons, count: logs.length }, null, 2));
}
run();
