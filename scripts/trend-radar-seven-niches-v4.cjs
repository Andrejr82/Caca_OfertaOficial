'use strict';
const config=require('./trend-radar-v4-config.cjs');
const domain=require('./trend-radar-v4-domain.cjs');
const temporal=require('./trend-radar-v4-temporal.cjs');
const selection=require('./trend-radar-v4-selection.cjs');
const persistence=require('./trend-radar-v4-persistence.cjs');
module.exports={...config,...domain,...temporal,...selection,...persistence};
