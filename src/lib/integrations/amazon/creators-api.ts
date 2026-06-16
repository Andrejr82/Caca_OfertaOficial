import { hasAmazonCreatorsEnv } from '@/lib/env';
import { AmazonAuthTokenResponse, AmazonGetItemsResponse, AmazonSearchItemsResponse } from '@/types/amazon';

// Cache in-memory for the LwA access token to avoid fetching it on every request
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;

/**
 * Retrieves the OAuth 2.0 access token using Login with Amazon (LwA)
 * Validates environment variables and caches the token based on expires_in.
 */
async function getAccessToken(): Promise<string> {
  if (!hasAmazonCreatorsEnv()) {
    throw new Error('Amazon Creators API environment variables are missing.');
  }

  // Return cached token if valid
  if (cachedAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const clientId = process.env.AMAZON_CLIENT_ID!;
  const clientSecret = process.env.AMAZON_CLIENT_SECRET!;

  // Amazon LwA endpoint for getting tokens
  const tokenUrl = 'https://api.amazon.com/auth/o2/token';
  const payload = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'amazon_associates' // Default scope for Creators API
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Amazon Access Token: ${response.status} ${errorText}`);
  }

  const data: AmazonAuthTokenResponse = await response.json();
  
  // Cache the token, subtract 60 seconds as a safety buffer
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return cachedAccessToken;
}

/**
 * Common configuration for Creators API requests
 */
function getApiEndpoint() {
  const marketplace = process.env.AMAZON_MARKETPLACE || 'www.amazon.com.br';
  // Note: The endpoint may vary depending on region, but usually hits an api.{region}.amazon.com 
  // Let's assume the Brazil endpoint for Creators API is api.amazon.com.br
  // This might need adjustment based on the exact Creators API docs for Brazil
  return `https://api.${marketplace.replace('www.', '')}/paapi5/searchitems`; // Needs to be adapted to Creators API exact path once fully released
}

/**
 * Search items on Amazon via Creators API
 */
export async function searchAmazonItems(keywords: string): Promise<AmazonSearchItemsResponse> {
  const token = await getAccessToken();
  const partnerTag = process.env.AMAZON_PARTNER_TAG!;

  // Example payload structure (subject to exact Creators API docs structure)
  const payload = {
    Keywords: keywords,
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Resources: [
      'Images.Primary.Large',
      'ItemInfo.Title',
      'OffersV2.Listings.Price',
    ],
  };

  const response = await fetch('https://api.amazon.com.br/paapi5/searchitems', { // Adjust endpoint as necessary
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SearchItems failed: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<AmazonSearchItemsResponse>;
}

/**
 * Get specific items by ASIN on Amazon via Creators API
 */
export async function getAmazonItems(asins: string[]): Promise<AmazonGetItemsResponse> {
  const token = await getAccessToken();
  const partnerTag = process.env.AMAZON_PARTNER_TAG!;

  const payload = {
    ItemIds: asins,
    ItemIdType: 'ASIN',
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Resources: [
      'Images.Primary.Large',
      'ItemInfo.Title',
      'OffersV2.Listings.Price',
    ],
  };

  const response = await fetch('https://api.amazon.com.br/paapi5/getitems', { // Adjust endpoint as necessary
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GetItems failed: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<AmazonGetItemsResponse>;
}
