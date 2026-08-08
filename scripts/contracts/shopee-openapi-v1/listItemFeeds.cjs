'use strict';
module.exports = {
  version: 'shopee-openapi-v1', operation: 'listItemFeeds', executable: true,
  query: 'query ListItemFeeds { listItemFeeds(feedMode: DELTA) { feeds { datafeedId datafeedName totalCount } } }',
  fields: ['datafeedId','datafeedName','totalCount'], rejectedFields: [], requiredFields: ['feedMode=DELTA','datafeedId'], optionalFields: ['datafeedName','totalCount'], commissionUnit: 'not_applicable', risks: ['FULL is intentionally disabled in V1', 'feed availability is date-dependent']
};
