const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOffers() {
    const { data, error } = await supabase
        .from('offers')
        .select('id, product_name, image_url, original_url, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching offers:", error);
        return;
    }

    console.log("LAST 5 OFFERS:");
    data.forEach(offer => {
        console.log(`\nID: ${offer.id}`);
        console.log(`Title: ${offer.product_name}`);
        console.log(`Image URL: ${offer.image_url}`);
    });
}

checkOffers();
