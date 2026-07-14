const PARALLEL_COMPONENT_DISABLED = 'PARALLEL_COMPONENT_DISABLED: generated parallel runtimes are forbidden';

function createProjectStructure() {
  throw new Error(PARALLEL_COMPONENT_DISABLED);
}
