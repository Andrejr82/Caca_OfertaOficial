'use strict';

const PARALLEL_COMPONENT_DISABLED = 'PARALLEL_COMPONENT_DISABLED: state cleanup must use official state commands';

function run() {
  throw new Error(PARALLEL_COMPONENT_DISABLED);
}

module.exports = { run };

if (require.main === module) run();
