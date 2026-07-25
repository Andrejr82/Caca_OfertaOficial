const fs = require('fs');
require('dotenv').config({path: '.env.local'});

async function main() {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/offers?created_at=gte.2026-07-24T23:35:16Z&select=id,platform,category_name,current_price,old_price,status,marketplace_metrics,score,created_at,product_name`;
    
    const response = await fetch(url, {
        headers: {
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
    });
    
    if (!response.ok) {
        console.error("HTTP Error:", response.status, await response.text());
        return;
    }
    
    const data = await response.json();
    console.log("Total offers found:", data.length);
    const platforms = {};
    const statusCounts = {};
    
    for (const offer of data) {
        platforms[offer.platform] = (platforms[offer.platform] || 0) + 1;
        statusCounts[offer.status] = (statusCounts[offer.status] || 0) + 1;
    }
    console.log("Platforms:", platforms);
    console.log("Statuses:", statusCounts);

    fs.writeFileSync('scratch/offers_output.json', JSON.stringify(data, null, 2));
}

main();
