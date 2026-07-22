import { describe, expect, it } from "vitest";
import {
  armClearsHistoryResyncBlock,
  assistantsAfterLastUser,
  findLastUserIndex,
  historyLastUserMatchesTimeline,
  isCleanAssistantStreamForResyncUnlock,
  shouldSkipHistoryResync,
} from "../src/shared/history-resync-policy.js";

describe("history-resync-policy (Phase 3)", () => {
  it("skips resync after stop until clean stream (not merely arm)", () => {
    expect(armClearsHistoryResyncBlock()).toBe(false);

    expect(
      shouldSkipHistoryResync({
        assistantStartedThisTurn: false,
        userStopSuppressed: false,
        blockAfterStop: true,
      }),
    ).toBe(true);

    expect(
      shouldSkipHistoryResync({
        assistantStartedThisTurn: false,
        userStopSuppressed: true,
        blockAfterStop: false,
      }),
    ).toBe(true);

    expect(
      shouldSkipHistoryResync({
        assistantStartedThisTurn: true,
        userStopSuppressed: false,
        blockAfterStop: false,
      }),
    ).toBe(true);

    // 正常完成、未 stop、未流式：允许 resync 防丢末包
    expect(
      shouldSkipHistoryResync({
        assistantStartedThisTurn: false,
        userStopSuppressed: false,
        blockAfterStop: false,
      }),
    ).toBe(false);
  });

  it("unlocks only on clean assistant stream length", () => {
    expect(isCleanAssistantStreamForResyncUnlock("hi")).toBe(false);
    expect(isCleanAssistantStreamForResyncUnlock("  a  ")).toBe(false);
    // minLen=8 code units（与 JS string.length 一致）
    expect(isCleanAssistantStreamForResyncUnlock("苹果是一种水果。")).toBe(true);
    expect(isCleanAssistantStreamForResyncUnlock("1234567")).toBe(false);
    expect(isCleanAssistantStreamForResyncUnlock("12345678")).toBe(true);
  });

  it("only returns assistants after the last user (no T1 under T2 user)", () => {
    const entries = [
      { role: "user", text: "玻璃" },
      { role: "assistant", text: "关于毛玻璃效果的长文……" },
      { role: "user", text: "苹果" },
      { role: "assistant", text: "苹果是一种水果。" },
    ];
    expect(findLastUserIndex(entries)).toBe(2);
    expect(assistantsAfterLastUser(entries)).toEqual(["苹果是一种水果。"]);
  });

  it("does not paste pre-last-user assistants when T1 wrote after cancel", () => {
    // 危险形状：停后 history 仍可能把 T1 续写落在 T2 user 后
    // 策略：只切 last user 之后；若 blockAfterStop 仍 true 则整段不 resync
    const entries = [
      { role: "user", text: "玻璃" },
      { role: "user", text: "苹果" },
      {
        role: "assistant",
        text: "毛玻璃（Frosted Glass）是 iOS 设计语言……",
      },
    ];
    // 切片会包含危险文（落盘在 last user 后）——必须靠 blockAfterStop 挡住
    const sliced = assistantsAfterLastUser(entries);
    expect(sliced.length).toBe(1);
    expect(
      shouldSkipHistoryResync({
        assistantStartedThisTurn: false,
        userStopSuppressed: false,
        blockAfterStop: true,
      }),
    ).toBe(true);
  });

  it("matches timeline last user with history last user", () => {
    const entries = [
      { role: "user", text: "玻璃" },
      { role: "user", text: "苹果" },
      { role: "assistant", text: "ok" },
    ];
    expect(historyLastUserMatchesTimeline(entries, "苹果")).toBe(true);
    expect(historyLastUserMatchesTimeline(entries, "香蕉")).toBe(false);
    expect(historyLastUserMatchesTimeline(entries, "")).toBe(true);
  });
});
