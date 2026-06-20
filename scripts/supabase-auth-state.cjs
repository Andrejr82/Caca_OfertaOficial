const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

/**
 * Adaptador customizado de AuthState para salvar as chaves no Supabase.
 * Permite que o Baileys funcione em ambientes Serverless/Efêmeros conectando no PostgreSQL.
 */
async function useSupabaseAuthState(supabase, sessionId = 'default') {
  // Helpers para read/write no DB
  const writeData = async (data, id) => {
    try {
      const dbId = `${sessionId}-${id}`;
      const payload = JSON.stringify(data, BufferJSON.replacer);
      const { error } = await supabase
        .from('baileys_sessions')
        .upsert({ id: dbId, data: JSON.parse(payload), updated_at: new Date().toISOString() }, { onConflict: 'id' });
      
      if (error) {
        console.error(`[Baileys-Supabase] Erro ao salvar ${dbId}:`, error.message);
      }
    } catch (e) {
      console.error(`[Baileys-Supabase] Catch salvando ${id}:`, e);
    }
  };

  const readData = async (id) => {
    try {
      const dbId = `${sessionId}-${id}`;
      const { data, error } = await supabase
        .from('baileys_sessions')
        .select('data')
        .eq('id', dbId)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignora row not found
        console.error(`[Baileys-Supabase] Erro lendo ${dbId}:`, error.message);
        return null;
      }
      
      if (data && data.data) {
        return JSON.parse(JSON.stringify(data.data), BufferJSON.reviver);
      }
      return null;
    } catch (e) {
      console.error(`[Baileys-Supabase] Catch lendo ${id}:`, e);
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      const dbId = `${sessionId}-${id}`;
      await supabase.from('baileys_sessions').delete().eq('id', dbId);
    } catch (e) {
      console.error(`[Baileys-Supabase] Erro apagando ${id}:`, e);
    }
  };

  // Inicializa as credenciais
  let creds = await readData('creds');
  if (!creds) {
    creds = initAuthCreds();
    await writeData(creds, 'creds');
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                // Conversão específica necessária pro Baileys
                value = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const fileId = `${category}-${id}`;
              if (value) {
                await writeData(value, fileId);
              } else {
                await removeData(fileId);
              }
            }
          }
        }
      }
    },
    saveCreds: () => {
      return writeData(creds, 'creds');
    }
  };
}

module.exports = { useSupabaseAuthState };
