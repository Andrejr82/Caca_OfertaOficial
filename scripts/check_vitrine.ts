import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve('C:/Projetos_GitHub/Caca_OfertaOficial/.env.local') });

async function main() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/posts?channel=eq.instagram&select=id,status,affiliate_link_id,offers(product_name),affiliate_links(tracked_url)&order=created_at.desc&limit=5`;
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`
    }
  });
  const data = await res.json();
  console.dir(data, { depth: null });
}

main();
