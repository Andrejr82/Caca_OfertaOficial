import dotenv from 'dotenv';
dotenv.config({ path: '.env.local.remote' });
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetId = process.env.WHATSAPP_TARGET_ID;
  const engineUrl = process.env.WHATSAPP_ENGINE_URL;
  const engineKey = process.env.WHATSAPP_ENGINE_API_KEY || 'local-dev-key';
  
  const ids = {
    amazon: "438270e7-76de-4f3c-9b05-108f73dea469",
    mercadolivre: "7e03967c-873e-4219-9e50-8ed6d5820d71",
    shopee: "e7baf992-f71e-4347-a580-c001a0406163",
  };

  for (const [name, offerId] of Object.entries(ids)) {
    console.log(`\n--- ${name.toUpperCase()} ---`);
    
    const postRes = await fetch(`${supabaseUrl}/rest/v1/posts?select=id,content,offers!inner(id)&offers.id=eq.${offerId}&limit=1`, {
      headers: {
        'apikey': serviceKey!,
        'Authorization': `Bearer ${serviceKey}`,
      }
    });
    const posts = await postRes.json();
    if (!posts || posts.length === 0) continue;
    const post = posts[0];
    
    const offerRes = await fetch(`${supabaseUrl}/rest/v1/offers?id=eq.${offerId}&select=product_name,platform,coupon,current_price,old_price`, {
      headers: { 'apikey': serviceKey!, 'Authorization': `Bearer ${serviceKey}` }
    });
    const offer = (await offerRes.json())[0];
    
    const linkRes = await fetch(`${supabaseUrl}/rest/v1/affiliate_links?offer_id=eq.${offerId}&limit=1`, {
      headers: { 'apikey': serviceKey!, 'Authorization': `Bearer ${serviceKey}` }
    });
    const linkObj = (await linkRes.json())[0];
    const linkUrl = linkObj ? linkObj.tracked_url : 'https://cacaoferta.com';
    
    const formatCurrency = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    let priceBlock = "";
    if (offer.current_price && offer.current_price > 0) {
      if (offer.old_price && offer.old_price > offer.current_price) {
        priceBlock = `💰 De: ${formatCurrency(offer.old_price)}\n🔥 Por: ${formatCurrency(offer.current_price)}`;
      } else {
        priceBlock = `🔥 Por: ${formatCurrency(offer.current_price)}`;
      }
    } else priceBlock = `💰 Confira no link`;
    
    const searchableText = `${offer.product_name}`.toLowerCase();
    const possibleBenefits = ['Prime Day', 'Black Friday', 'Oferta Relâmpago', 'Frete Grátis', 'Cashback', 'Desconto Progressivo', 'Loja Oficial', 'Oferta Exclusiva'];
    const foundBenefits = possibleBenefits.filter(b => searchableText.includes(b.toLowerCase()));
    const benefitBlock = foundBenefits.length > 0 ? `\n✨ ${foundBenefits.join(', ')}` : "";

    const couponLine = offer.coupon ? `\n🎟 Use o cupom: ${offer.coupon}` : "";
    const finalCta = offer.coupon ? `🛒 Resgate antes que acabe` : `🛒 Garantir oferta`;

    const blocks = [
      `🚨 ${offer.product_name}`,
      priceBlock,
      `🛒 ${offer.platform || 'Loja parceira'}${couponLine}${benefitBlock}`,
      `🔗 ${linkUrl}`,
      finalCta
    ];
    const text = blocks.filter(Boolean).join("\n\n");

    
    console.log(`Generating local premium image...`);
    const localImgRes = await fetch(`http://localhost:3005/api/images/whatsapp-premium?offerId=${offerId}`);
    if (!localImgRes.ok) throw new Error(`Local image failed: ${localImgRes.status}`);
    const buffer = Buffer.from(await localImgRes.arrayBuffer());
    
    console.log(`Uploading to Cloudinary...`);
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder: 'whatsapp_sprint07' }, (err, res) => {
        if (err) reject(err); else resolve(res);
      }).end(buffer);
    }) as any;
    
    const premiumImageUrl = uploadResult.secure_url;
    console.log(`Image URL: ${premiumImageUrl}`);
    console.log(`Post ID: ${post.id}`);
    
    const payload = { targetId, text, imageUrl: premiumImageUrl };
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').substring(0, 10);
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${hash}`;
    
    const engineRes = await fetch(`${engineUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": engineKey,
        "x-request-id": requestId,
        "Bypass-Tunnel-Reminder": "true"
      },
      body: JSON.stringify(payload)
    });
    
    if (engineRes.ok) {
      const result = await engineRes.json();
      console.log(`MessageId: ${result.messageId}`);
    } else {
      const err = await engineRes.text();
      console.log(`Failed: ${engineRes.status} ${err}`);
    }
  }
}

run();
