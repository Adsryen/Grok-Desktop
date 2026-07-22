import { describe, expect, it } from "vitest";
import {
  resolveBusySendWhileCancelling,
  shouldIgnoreCancelledTurnCompleted,
  shouldIgnoreLateSessionWorking,
  shouldIgnoreLateTurnStarted,
  shouldJoinInFlightCancel,
  shouldPaintStoppedPhase,
} from "../src/shared/turn-ui-state.js";

describe("turn-ui-state (Phase 4)", () => {
  it("paints stopped phase only once", () => {
    expect(shouldPaintStoppedPhase({ alreadyPaintedStopped: false })).toBe(
      true,
    );
    expect(shouldPaintStoppedPhase({ alreadyPaintedStopped: true })).toBe(
      false,
    );
  });

  it("ignores cancelled completed after optimistic stop", () => {
    expect(
      shouldIgnoreCancelledTurnCompleted({
        turnActive: false,
        alreadyPaintedStopped: true,
        userStopSuppressed: true,
        isCancelled: true,
      }),
    ).toBe(true);

    expect(
      shouldIgnoreCancelledTurnCompleted({
        turnActive: false,
        alreadyPaintedStopped: false,
        userStopSuppressed: false,
        isCancelled: true,
      }),
    ).toBe(true);

    // 仍在 working 的真取消：不忽略，应 endTurn
    expect(
      shouldIgnoreCancelledTurnCompleted({
        turnActive: true,
        alreadyPaintedStopped: false,
        userStopSuppressed: false,
        isCancelled: true,
      }),
    ).toBe(false);
  });

  it("drops late turn.started while suppressed or cancelling", () => {
    expect(
      shouldIgnoreLateTurnStarted({
        turnActive: false,
        userStopSuppressed: true,
        phase: "idle",
      }),
    ).toBe(true);
    expect(
      shouldIgnoreLateTurnStarted({
        turnActive: false,
        userStopSuppressed: false,
        phase: "cancelling",
      }),
    ).toBe(true);
    expect(
      shouldIgnoreLateTurnStarted({
        turnActive: true,
        userStopSuppressed: true,
        phase: "working",
      }),
    ).toBe(false);
  });

  it("drops late session working while cancelling", () => {
    expect(
      shouldIgnoreLateSessionWorking({
        userStopSuppressed: false,
        phase: "cancelling",
        eventBelongsToActiveSession: true,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreLateSessionWorking({
        userStopSuppressed: false,
        phase: "idle",
        eventBelongsToActiveSession: true,
      }),
    ).toBe(false);
  });

  it("joins in-flight cancel", () => {
    expect(shouldJoinInFlightCancel({ cancelInFlight: true })).toBe(true);
    expect(shouldJoinInFlightCancel({ cancelInFlight: false })).toBe(false);
  });

  it("resolves busy send while cancelling", () => {
    expect(
      resolveBusySendWhileCancelling({
        cancelInFlight: true,
        turnActive: false,
        hasDraft: false,
        busySendMode: "queue",
      }),
    ).toBe("join_only");
    expect(
      resolveBusySendWhileCancelling({
        cancelInFlight: true,
        turnActive: false,
        hasDraft: true,
        busySendMode: "queue",
      }),
    ).toBe("enqueue");
    expect(
      resolveBusySendWhileCancelling({
        cancelInFlight: true,
        turnActive: false,
        hasDraft: true,
        busySendMode: "send_now",
      }),
    ).toBe("wait_then_send");
    expect(
      resolveBusySendWhileCancelling({
        cancelInFlight: false,
        turnActive: false,
        hasDraft: true,
        busySendMode: "queue",
      }),
    ).toBe("send_idle");
  });
});
