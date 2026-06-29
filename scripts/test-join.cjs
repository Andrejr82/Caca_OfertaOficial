const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLinks() {
    const subId = 'wp_25ad65af';
    const { data: links, error } = await supabase
        .from("affiliate_links")
        .select(`
            *,
            offers (
                product_name,
                image_url
            )
        `)
        .ilike("sub_id", `${subId}%`)
        .limit(1);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("JOIN RESULT:");
    console.log(JSON.stringify(links, null, 2));
}

checkLinks();
