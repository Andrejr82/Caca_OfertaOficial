const fs = require('fs');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync('.env.local'));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function query(table, select = '*', eq = null) {
  let url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + encodeURIComponent(select);
  if (eq) url += '&' + eq.col + '=eq.' + eq.val;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    }
  });
  return res.json();
}

async function run() {
  const data = await query('discovery_logs', '*', {col: 'cycle_id', val: '42a91829-0209-4cda-8f58-533b874e7257'});
  if (data && data.length) {
    console.log('Found ' + data.length + ' logs in discovery_logs for cycle');
    fs.writeFileSync('temp_logs.json', JSON.stringify(data, null, 2));
  } else {
    console.log('No logs found in discovery_logs');
  }
}
run();
