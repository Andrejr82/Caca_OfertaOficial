'use strict';

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { processTelegramQueue } = require('./telegram-auto-publisher.cjs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { 
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: {
      transport: require('ws')
    }
  }
);

async function run() {
  console.log('--- Ativando automação do Telegram via banco ---');
  await supabase
    .from('app_settings')
    .upsert({ 
      user_id: '7a9ca7b7-f464-46e0-a9de-9b322c73628a', 
      key: 'general_settings', 
      value: { telegram_automation_enabled: true, cron_scraping_enabled: false, notifications_enabled: false } 
    }, { onConflict: 'user_id,key' });

  console.log('--- Executando a fila ---');
  await processTelegramQueue();

  console.log('--- Desativando automação do Telegram ---');
  await supabase
    .from('app_settings')
    .upsert({ 
      user_id: '7a9ca7b7-f464-46e0-a9de-9b322c73628a', 
      key: 'general_settings', 
      value: { telegram_automation_enabled: false, cron_scraping_enabled: false, notifications_enabled: false } 
    }, { onConflict: 'user_id,key' });

  console.log('--- Concluído ---');
}

run().catch(console.error);
