'use strict';
module.exports = {
  version: 'shopee-openapi-v1', operation: 'getItemFeedData', executable: true,
  query: 'query GetItemFeedData($datafeedId: String!, $offset: Int, $limit: Int) { getItemFeedData(datafeedId: $datafeedId, offset: $offset, limit: $limit) { rows { columns updateType } } }',
  fields: ['columns','updateType'], rejectedFields: [], requiredFields: ['datafeedId','columns','updateType'], optionalFields: ['offset','limit'], commissionUnit: 'embedded_columns_runtime_normalize', risks: ['columns is JSON text in the observed runtime', 'DELETE must be represented as tombstone']
};
