import ws from 'ws';
(global as any).WebSocket = ws;

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { whatsappService } from '@/lib/integrations/whatsapp';
import { resolveConfiguredWhatsAppTargetId } from '@/lib/integrations/whatsapp/target';

async function run() {
  const db = createSupabaseAdminClient();
  if (!db) {
      console.log('No DB client');
      return;
  }
  
  const targetId = resolveConfiguredWhatsAppTargetId();
  if (!targetId) {
      console.log('No target ID');
      return;
  }

  const ids = {
    amazon: "438270e7-76de-4f3c-9b05-108f73dea469",
    mercadolivre: "7e03967c-873e-4219-9e50-8ed6d5820d71",
    shopee: "e7baf992-f71e-4347-a580-c001a0406163",
  };

  for (const [name, offerId] of Object.entries(ids)) {
    console.log(`\n--- Fetching ${name} ---`);
    // Find post for this offer
    const { data: posts, error } = await db.from('posts').select('id, content, offers!inner(id, platform)').eq('offers.id', offerId).limit(1);
    if (error || !posts || posts.length === 0) {
        console.log(`No post found for offer ${offerId}:`, error);
        continue;
    }
    
    const post = posts[0];
    const premiumImageUrl = `http://localhost:3005/api/images/whatsapp-premium?offerId=${offerId}`;
    
    console.log(`Publishing ${name}:`, post.id);
    try {
        const result = await whatsappService.sendMedia(targetId, post.content, premiumImageUrl);
        console.log(`Success:`, result.messageId);
    } catch (e: any) {
        console.log(`Failed:`, e.message);
    }
  }
}
run();
