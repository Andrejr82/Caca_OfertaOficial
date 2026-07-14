'use strict';

const PARALLEL_COMPONENT_DISABLED = 'PARALLEL_COMPONENT_DISABLED: provider fallback is not an official client capability';

function run() {
  throw new Error(PARALLEL_COMPONENT_DISABLED);
}

module.exports = { run };

if (require.main === module) run();
