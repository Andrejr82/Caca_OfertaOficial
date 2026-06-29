
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = fs.existsSync('.env.local.remote') ? '.env.local.remote' : '.env.local';
require('dotenv').config({ path: envPath });
console.log(`[CLEAR-WA-SESSION] ENV carregado: ${envPath}`);

// Supabase no Node.js 20 exige 'ws' nativamente para conexões Realtime
global.WebSocket = require('ws');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearSession() {
    console.log('Limpando sessão antiga do WhatsApp...');
    const { error } = await supabase.from('baileys_sessions').delete().like('id', 'default-%');
    if (error) {
        console.error('Erro:', error);
    } else {
        console.log('✅ Sessão limpa com sucesso!');
    }
    process.exit(0);
}

clearSession();
