const fs = require('fs');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync('.env.local'));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function query(table, select = '*') {
  let url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + encodeURIComponent(select);
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    }
  });
  return res.json();
}

async function run() {
  const data = await query('integration_logs', '*');
  if (data && data.length) {
    const cycleLogs = data.filter(d => JSON.stringify(d).includes('42a91829-0209-4cda-8f58-533b874e7257'));
    console.log('Found ' + cycleLogs.length + ' logs in integration_logs for cycle');
  } else {
    console.log('No logs found in integration_logs');
  }
}
run();
