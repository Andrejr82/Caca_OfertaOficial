const fs = require('fs');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testImages() {
    const { data: offers, error } = await supabase
        .from('offers')
        .select('id, image_url')
        .order('created_at', { ascending: false })
        .limit(3);

    if (error) {
        console.error("Error:", error);
        return;
    }

    for (let i = 0; i < offers.length; i++) {
        const offer = offers[i];
        console.log(`Processing image ${i + 1}: ${offer.image_url}`);
        
        try {
            const imgRes = await fetch(offer.image_url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
                }
            });

            if (!imgRes.ok) throw new Error(`Failed to download: ${imgRes.statusText}`);
            
            const arrayBuffer = await imgRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            const imageBuffer = await sharp(buffer)
                .resize({ width: 800, withoutEnlargement: true })
                .jpeg({ quality: 80, force: true })
                .toBuffer();
                
            fs.writeFileSync(`test-image-${i + 1}.jpeg`, imageBuffer);
            console.log(`Saved test-image-${i + 1}.jpeg (${imageBuffer.length} bytes)`);
        } catch (err) {
            console.error(`Error processing image ${i + 1}:`, err);
        }
    }
}

testImages();
