const fs = require('fs');
const path = require('path');

async function run() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Arquivo .env.local não encontrado.');
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] ? match[2].trim() : '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      envVars[match[1]] = value;
    }
  });

  const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no .env.local');
    return;
  }

  const targetEmail = 'andre.junior55@gmail.com';
  console.log(`Buscando usuário com e-mail: ${targetEmail} via REST API...`);

  // 1. Listar usuários da Auth (usando a API Admin do Supabase)
  // Nota: A API de admin de usuários da auth fica sob /auth/v1/admin/users
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'GET',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    }
  });

  if (!authResponse.ok) {
    const errorText = await authResponse.text();
    console.error('Erro ao listar usuários do Supabase Auth:', errorText);
    return;
  }

  const authData = await authResponse.json();
  const users = authData.users || [];

  const user = users.find((u) => u.email === targetEmail);
  if (!user) {
    console.error(`Usuário com e-mail ${targetEmail} não encontrado no Supabase Auth.`);
    console.log('Certifique-se de que o usuário já se cadastrou ou foi criado na tela de login.');
    return;
  }

  console.log(`Usuário encontrado! ID: ${user.id}`);
  console.log(`Promovendo a admin na tabela public.profiles via PostgREST API...`);

  // 2. Realizar o Upsert no perfil via PostgREST
  // A PostgREST suporta upsert enviando POST com o header Prefer: resolution=merge-duplicates
  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      id: user.id,
      full_name: 'André Junior',
      role: 'admin',
      status: 'active'
    })
  });

  if (!profileResponse.ok) {
    const errorText = await profileResponse.text();
    console.error('Erro ao atualizar perfil na tabela profiles:', errorText);
    return;
  }

  console.log('--------------------------------------------------');
  console.log(`SUCESSO: Usuário ${targetEmail} promovido a ADMINISTRADOR!`);
  console.log('Agora ele tem acesso total para criar e gerenciar outros usuários.');
  console.log('--------------------------------------------------');
}

run().catch(console.error);
