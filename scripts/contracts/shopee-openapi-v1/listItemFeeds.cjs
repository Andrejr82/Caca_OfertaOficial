'use strict';

const queries = Object.freeze({
  DELTA: 'query ListItemFeedsDelta { listItemFeeds(feedMode: DELTA) { feeds { datafeedId datafeedName totalCount } } }',
  FULL: 'query ListItemFeedsFull { listItemFeeds(feedMode: FULL) { feeds { datafeedId datafeedName totalCount } } }',
});

module.exports = {
  version: 'shopee-openapi-v1', operation: 'listItemFeeds', executable: true,
  query: queries.DELTA,
  queries,
  fields: ['datafeedId','datafeedName','totalCount'], rejectedFields: [], requiredFields: ['feedMode=FULL|DELTA','datafeedId'], optionalFields: ['datafeedName','totalCount'], commissionUnit: 'not_applicable', risks: ['feed availability is date-dependent', 'FULL must be sampled with bounded distributed offsets']
};
