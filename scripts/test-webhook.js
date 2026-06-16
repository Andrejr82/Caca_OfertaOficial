const fetch = require('node-fetch'); // we'll use native fetch

async function triggerWebhook() {
  const payload = {
    "object": "instagram",
    "entry": [
      {
        "id": "mock_instagram_account_id",
        "time": 1234567890,
        "changes": [
          {
            "field": "comments",
            "value": {
              "id": "mock_comment_id_123",
              "text": "eu quero",
              "from": {
                "id": "mock_user_id_456"
              },
              "media": {
                "id": "17907580236431118"
              }
            }
          }
        ]
      }
    ]
  };

  const res = await fetch("https://caca-oferta-oficial.vercel.app/api/webhooks/instagram", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  console.log("Webhook response status:", res.status);
  const text = await res.text();
  console.log("Webhook response text:", text);
}

triggerWebhook();
