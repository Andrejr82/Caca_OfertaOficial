const fs = require('fs');

async function createLogTable() {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const env = {};
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) env[key.trim()] = val.join('=').trim().replace(/"/g, '');
  });

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  const sql = `
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel TEXT,
      payload JSONB,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // We have to use the REST API to execute SQL if we don't have the psql client.
  // Actually, Supabase doesn't expose arbitrary SQL via REST API.
  // I will just use the Supabase JS client to insert if the table exists, but if it doesn't, it will error.
  console.log("To create the table, the user must run the SQL in Supabase dashboard.");
}

createLogTable();
