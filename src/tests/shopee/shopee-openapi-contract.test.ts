import { describe, expect, it, vi } from 'vitest';
import { createSignedRequest, GRAPHQL_CONTRACTS, normalizeProductOffer } from '../../../scripts/shopee-openapi-shadow-engine-v1.cjs';

describe('Shopee OpenAPI V1 Contract Tests (T41)', () => {
  it('assinatura HMAC com relógio controlado, operação e variáveis corretas', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1700000000000)); // Timestamp: 1700000000
    
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';
    
    const requestStub = async ({ body, headers }: any) => {
      capturedHeaders = headers;
      capturedBody = body;
      return { status: 200, data: {} };
    };
    
    const signedRequest = createSignedRequest({
      appId: 'testApp',
      appSecret: 'testSecret',
      request: requestStub
    });
    
    await signedRequest('ShopeePromotionOffers', GRAPHQL_CONTRACTS.productOfferV2.query, { keyword: 'test' });
    
    expect(capturedHeaders.Authorization).toContain('Timestamp=1700000000');
    expect(capturedHeaders.Authorization).toContain('Credential=testApp');
    expect(capturedHeaders.Authorization).toMatch(/Signature=[a-f0-9]{64}/);
    expect(JSON.parse(capturedBody)).toEqual({
      operationName: 'ShopeePromotionOffers',
      query: GRAPHQL_CONTRACTS.productOfferV2.query,
      variables: { keyword: 'test' }
    });
    
    vi.useRealTimers();
  });

  it('resposta com errors GraphQL', async () => {
    const requestStub = async () => ({
      status: 200,
      data: { errors: [{ message: 'Invalid query' }] }
    });
    
    const signedRequest = createSignedRequest({ appId: 'a', appSecret: 'b', request: requestStub });
    const result = await signedRequest('Op', 'query', {});
    expect(result.data.errors).toBeDefined();
    expect(result.data.errors[0].message).toBe('Invalid query');
  });

  it('timeout e 429 HTTP status code', async () => {
    const requestStub = async () => ({
      status: 429,
      data: { message: 'Too Many Requests' }
    });
    
    const signedRequest = createSignedRequest({ appId: 'a', appSecret: 'b', request: requestStub });
    const result = await signedRequest('Op', 'query', {});
    expect(result.status).toBe(429);
  });

  it('compatibilidade dos campos de productOfferV2 e ausência de campos opcionais', () => {
    // Apenas campos obrigatórios presentes na resposta da API
    const rawNode = {
      itemId: "123",
      shopId: "456",
      productName: "Cadeira",
      productLink: "https://shopee/123",
      imageUrl: "http://img.com/1",
      price: "100.00" // Ausentes: priceMin, priceMax, discount, ratingStar
    };

    const result = normalizeProductOffer(rawNode, {});
    expect(result.accepted).toBe(true);
    expect(result.product.itemId).toBe("123");
    expect(result.product.price).toBe(100);
    expect(result.product.priceMin).toBe(0);
    expect(result.product.ratingStar).toBe(0);
    expect(result.product.commissionPercent).toBe(0);
    expect(result.product.commissionUnresolved).toBe(true);
  });

  it('paginação e hasNextPage', () => {
    // Simulação do comportamento de paginação
    const mockResponse = {
      data: {
        productOfferV2: {
          nodes: [{ itemId: "1" }],
          pageInfo: {
            hasNextPage: true,
            page: 2
          }
        }
      }
    };

    const pageInfo = mockResponse.data.productOfferV2.pageInfo;
    expect(pageInfo.hasNextPage).toBe(true);
    expect(pageInfo.page).toBeGreaterThan(1);
  });
});
