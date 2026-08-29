import type { EntityType, State } from "./types";

const transitions: Readonly<Record<EntityType, ReadonlySet<string>>> = {
  offer: new Set([
    "pending_manual_review:selected",
    "pending_manual_review:approved",
    "selected:approved",
    "approved:posted",
    "pending_manual_review:rejected",
    "selected:rejected",
    "approved:rejected",
    "rejected:pending_manual_review"
  ]),
  post: new Set(["draft:published"])
};

export function validateTransition(entityType: EntityType, fromState: State, toState: State): boolean {
  return transitions[entityType].has(`${fromState}:${toState}`);
}
