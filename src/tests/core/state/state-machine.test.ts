import { describe, expect, it } from "vitest";

import {
  assertExpectedState,
  validateTransition,
  type EntityType,
  type State,
  type StateEntity
} from "@/core/state";

describe("official state machine", () => {
  const validTransitions: ReadonlyArray<[EntityType, State, State]> = [
    ["offer", "pending_manual_review", "selected"],
    ["offer", "pending_manual_review", "approved"],
    ["offer", "selected", "approved"],
    ["offer", "approved", "posted"],
    ["offer", "pending_manual_review", "rejected"],
    ["offer", "selected", "rejected"],
    ["offer", "approved", "rejected"],
    ["post", "draft", "published"]
  ];

  it.each(validTransitions)("accepts %s %s -> %s", (entityType, fromState, toState) => {
    expect(validateTransition(entityType, fromState, toState)).toBe(true);
  });

  const invalidTransitions: ReadonlyArray<[EntityType, State, State]> = [
    ["offer", "selected", "posted"],
    ["offer", "posted", "rejected"],
    ["offer", "rejected", "selected"],
    ["post", "published", "draft"],
    ["post", "draft", "draft"]
  ];

  it.each(invalidTransitions)("rejects %s %s -> %s", (entityType, fromState, toState) => {
    expect(validateTransition(entityType, fromState, toState)).toBe(false);
  });

  it("rejects states that belong to another entity type", () => {
    expect(validateTransition("post", "pending_manual_review", "selected")).toBe(false);
    expect(validateTransition("offer", "draft", "published")).toBe(false);
  });
});

describe("assertExpectedState", () => {
  const entity: StateEntity = {
    entityType: "offer",
    entityId: "offer-1",
    tenantId: "tenant-1",
    state: "selected",
    version: 4
  };

  it("accepts matching state and version", () => {
    expect(() => assertExpectedState(entity, "selected", 4)).not.toThrow();
  });

  it("reports a state conflict before persistence", () => {
    expect(() => assertExpectedState(entity, "pending_manual_review", 4)).toThrowError(
      expect.objectContaining({ code: "STATE_CONFLICT" })
    );
  });

  it("reports a version conflict before persistence", () => {
    expect(() => assertExpectedState(entity, "selected", 3)).toThrowError(
      expect.objectContaining({ code: "VERSION_CONFLICT" })
    );
  });
});
