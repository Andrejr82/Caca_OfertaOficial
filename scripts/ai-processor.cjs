'use strict';

const PARALLEL_COMPONENT_DISABLED = 'PARALLEL_COMPONENT_DISABLED: use generateOfficialAI()';

function runAiProcessorCycle() {
  throw new Error(PARALLEL_COMPONENT_DISABLED);
}

module.exports = { runAiProcessorCycle };

if (require.main === module) runAiProcessorCycle();
