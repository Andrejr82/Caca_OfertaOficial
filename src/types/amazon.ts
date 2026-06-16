export interface AmazonItemImage {
  URL: string;
  Height: number;
  Width: number;
}

export interface AmazonItemPrice {
  Amount: number;
  Currency: string;
  DisplayAmount: string;
}

export interface AmazonItemInfo {
  Title: {
    DisplayValue: string;
    Label: string;
    Locale: string;
  };
  // Other fields can be added as needed (e.g., Features, ProductInfo)
}

export interface AmazonItemOffers {
  Listings: Array<{
    Id: string;
    Price: AmazonItemPrice;
    ViolatesMAP: boolean;
    IsBuyBoxWinner?: boolean;
    Availability?: {
      Type: string;
      Message: string;
    };
  }>;
}

export interface AmazonItem {
  ASIN: string;
  DetailPageURL: string;
  ItemInfo?: AmazonItemInfo;
  Images?: {
    Primary?: {
      Small?: AmazonItemImage;
      Medium?: AmazonItemImage;
      Large?: AmazonItemImage;
    };
    Variants?: Array<{
      Small?: AmazonItemImage;
      Medium?: AmazonItemImage;
      Large?: AmazonItemImage;
    }>;
  };
  OffersV2?: AmazonItemOffers; // Creators API may use Offers or OffersV2 based on endpoint
}

export interface AmazonSearchItemsResponse {
  SearchResult: {
    Items: AmazonItem[];
    TotalResultCount: number;
    SearchURL: string;
  };
}

export interface AmazonGetItemsResponse {
  ItemsResult: {
    Items: AmazonItem[];
  };
}

export interface AmazonAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
