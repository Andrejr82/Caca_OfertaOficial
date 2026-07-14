'use strict';

const PARALLEL_COMPONENT_DISABLED = 'PARALLEL_COMPONENT_DISABLED: experimental inference must use generateOfficialAI()';

function run() {
  throw new Error(PARALLEL_COMPONENT_DISABLED);
}

module.exports = { run };

if (require.main === module) run();
