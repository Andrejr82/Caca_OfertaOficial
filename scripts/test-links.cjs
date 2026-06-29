const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLinks() {
    const { data, error } = await supabase
        .from('affiliate_links')
        .select('id, channel, sub_id, tracked_url, original_url, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching links:", error);
        return;
    }

    console.log("LAST 10 LINKS:");
    data.forEach(link => {
        console.log(`\nChannel: ${link.channel}`);
        console.log(`SubID: ${link.sub_id}`);
        console.log(`Tracked: ${link.tracked_url}`);
    });
}

checkLinks();
