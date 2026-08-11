import { describe, expect, it } from "vitest";
import {
  buildRadarExecutionWindow,
  claimTrendRadarExecution,
  type RadarExecutionIdentity,
  type RadarExecutionStore,
} from "@/lib/trends/radar-execution";

const identity: RadarExecutionIdentity = {
  userId: "user-1",
  radarDate: "2026-08-10",
  windowStart: "2026-08-04T00:00:00.000Z",
  windowEnd: "2026-08-11T00:00:00.000Z",
  strategyVersion: "daily-commercial-radar-v1",
};

function store(overrides: Partial<RadarExecutionStore> = {}): RadarExecutionStore {
  return {
    createRun: async () => ({ id: "run-1" }),
    findRun: async () => null,
    restartFailedRun: async () => false,
    markFailed: async () => {},
    ...overrides,
  };
}

describe("Radar execution claim", () => {
  it("cria janela diária determinística em America/Sao_Paulo", () => {
    const first = buildRadarExecutionWindow(new Date("2026-08-11T01:30:00.000Z"));
    const second = buildRadarExecutionWindow(new Date("2026-08-11T02:30:00.000Z"));

    expect(first).toEqual({
      radarDate: "2026-08-10",
      windowStart: "2026-08-04T00:00:00.000Z",
      windowEnd: "2026-08-11T00:00:00.000Z",
    });
    expect(second).toEqual(first);
  });

  it("reivindica execução nova", async () => {
    await expect(claimTrendRadarExecution(store(), identity)).resolves.toEqual({
      status: "claimed",
      runId: "run-1",
    });
  });

  it("devolve completed sem repetir execução", async () => {
    await expect(claimTrendRadarExecution(store({
      createRun: async () => null,
      findRun: async () => ({ id: "run-existing", status: "completed" }),
    }), identity)).resolves.toEqual({ status: "completed", runId: "run-existing" });
  });

  it("bloqueia segunda execução enquanto building", async () => {
    await expect(claimTrendRadarExecution(store({
      createRun: async () => null,
      findRun: async () => ({ id: "run-existing", status: "building" }),
    }), identity)).resolves.toEqual({ status: "running", runId: "run-existing" });
  });

  it("retoma failed apenas quando o update condicional vence", async () => {
    await expect(claimTrendRadarExecution(store({
      createRun: async () => null,
      findRun: async () => ({ id: "run-failed", status: "failed" }),
      restartFailedRun: async () => true,
    }), identity)).resolves.toEqual({ status: "claimed", runId: "run-failed" });

    await expect(claimTrendRadarExecution(store({
      createRun: async () => null,
      findRun: async () => ({ id: "run-failed", status: "failed" }),
      restartFailedRun: async () => false,
    }), identity)).resolves.toEqual({ status: "running", runId: "run-failed" });
  });
});
