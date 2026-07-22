import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HostError } from "../src/shared/errors.js";
import {
  HOST_EVENT_CHANNEL,
  HOST_IPC_CHANNEL,
} from "../src/shared/host-api.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("contract audit", () => {
  it("renderer does not spawn grok; uses Host bridge", () => {
    const main = read("src/renderer/main.ts");
    const html = read("src/renderer/index.html");
    expect(main).not.toMatch(/from\s+["']node:child_process["']/);
    expect(main).not.toMatch(/\bspawn\s*\(/);
    expect(main).toMatch(/grokDesktop\.invoke/);
    expect(main).toMatch(/handleDeepLinkPayload/);
  });

  it("UI matches Codex desktop shell structure", () => {
    const html = read("src/renderer/index.html");
    const css = read("src/renderer/styles.css");
    const main = read("src/renderer/main.ts");
    // Three-column codex shell
    expect(html).toMatch(/codex-app/);
    expect(html).toMatch(/新对话/);
    expect(html).toMatch(/项目/);
    expect(html).toMatch(/对话/);
    expect(html).toMatch(/自动化/);
    expect(html).toMatch(/插件/);
    expect(html).toMatch(/设置/);
    expect(html).toMatch(/随心输入/);
    expect(html).toMatch(/完全访问/);
    // 权限 chip 下拉 caret 须独立节点，避免被裁切/丢失
    expect(html).toMatch(/mode-chip-caret/);
    expect(css).toMatch(/\.mode-chip\s*\{[^}]*line-height/s);
    expect(html).toMatch(/打开位置/);
    expect(html).toMatch(/文件/);
    expect(html).toMatch(/浏览器/);
    expect(html).toMatch(/终端/);
    // Light theme
    expect(css).toMatch(/#ffffff|#fff|f5f5f5/i);
    // Project → thread interactions
    expect(main).toMatch(/startNewChat/);
    expect(main).toMatch(/refreshProjectsAndThreads/);
    // Project path from native folder picker, not free-text only
    expect(main).toMatch(/system\.pickDirectory/);
    expect(main).toMatch(/pickAndAddProject/);
  });

  it("preload is CJS for Electron bridge", () => {
    const preload = read("src/main/preload.cjs");
    expect(preload).toMatch(/contextBridge\.exposeInMainWorld/);
    expect(preload).toMatch(/require\(["']electron["']\)/);
    const main = read("src/main/index.ts");
    expect(main).toMatch(/preload\.cjs/);
  });

  it("main shell tray lifecycle helpers exist", () => {
    const main = read("src/main/index.ts");
    expect(main).toMatch(/e\.preventDefault\(\)/);
    expect(main).toMatch(/showMainWindow/);
    expect(main).toMatch(/isQuitting/);
    expect(main).toMatch(/shellStartHandoffWatch/);
    expect(main).toMatch(/shell\.navigate|shellNavigateEvent/);
  });

  it("shell control events and turn settle guard exist", () => {
    const events = read("src/shared/events.ts");
    expect(events).toMatch(/shell\.handoff/);
    expect(events).toMatch(/shellEventFromLegacyActivity/);
    const renderer = read("src/renderer/main.ts");
    expect(renderer).toMatch(/Never force-end an active turn/);
    expect(renderer).toMatch(/shell\.handoff/);
  });

  it("session isolation: event filter + view gen + queue L1 drain", () => {
    const renderer = read("src/renderer/main.ts");
    expect(renderer).toMatch(/sessionViewGen/);
    expect(renderer).toMatch(/eventBelongsToActiveSession/);
    expect(renderer).toMatch(/isTranscriptScopedEvent/);
    expect(renderer).toMatch(/hostTakeNext/);
    expect(renderer).toMatch(/hostCompleteSending/);
    const api = read("src/shared/host-api.ts");
    expect(api).toMatch(/queue\.takeNext/);
    expect(api).toMatch(/queue\.completeSending/);
    const main = read("src/main/index.ts");
    expect(main).toMatch(/queue\.takeNext/);
    expect(main).toMatch(/queue\.completeSending/);
    const host = read("src/host/host.ts");
    expect(host).toMatch(/attachInflight/);
    expect(host).toMatch(/deleteQueueFile/);
  });

  it("Host API product vocabulary and errors", () => {
    const host = read("src/host/host.ts");
    expect(host).toMatch(/threadsCreate/);
    expect(host).toMatch(/projectsList/);
    expect(host).not.toMatch(/mvpSession/i);
    const err = new HostError("SESSION_BUSY", "busy");
    expect(err.toJSON().code).toBe("SESSION_BUSY");
  });

  it("IPC channel constants are stable", () => {
    expect(HOST_IPC_CHANNEL).toBe("grok-desktop-host");
    expect(HOST_EVENT_CHANNEL).toBe("grok-desktop-host-event");
  });

  it("turn completion UX and full-access confirm exist", () => {
    const events = read("src/shared/events.ts");
    expect(events).toMatch(/hadAssistantText/);
    expect(events).toMatch(/hadToolActivity/);
    const acp = read("src/host/acp-client.ts");
    expect(acp).toMatch(/hadToolActivityThisTurn/);
    expect(acp).toMatch(/error: message/);
    const renderer = read("src/renderer/main.ts");
    // 超时/空回合文案走 i18n key；renderer 用 tr() 引用
    expect(renderer).toMatch(/chat\.turnEmpty|chat\.turnToolFailed|showTurnErrorOnce/);
    const settings = read("src/renderer/settings-page.ts");
    expect(settings).toMatch(/settings\.perm\.fullConfirm/);
    const en = read("src/shared/i18n/locales/en-US.ts");
    expect(en).toMatch(/chat\.turnTimeout/);
    expect(en).toMatch(/settings\.perm\.fullConfirm/);
  });

  it("session/cancel CLI meta + Stop/Esc trigger paths exist", () => {
    const acp = read("src/host/acp-client.ts");
    expect(acp).toMatch(/cancelSubagents:\s*true/);
    expect(acp).toMatch(/cancelTrigger/);
    expect(acp).toMatch(/cancelPromptId/);
    expect(acp).toMatch(/rewindIfPristine:\s*false/);
    // ROOT: cancel must be ACP notification (notify), not request
    expect(acp).toMatch(/notify\(\s*["']session\/cancel["']/);
    expect(acp).toMatch(/CancelNotification|wire:\s*["']notification["']/);
    const renderer = read("src/renderer/main.ts");
    expect(renderer).toMatch(/trigger:\s*"stop"/);
    expect(renderer).toMatch(/trigger:\s*"esc"/);
    const main = read("src/main/index.ts");
    expect(main).toMatch(/turns\.cancel/);
    expect(main).toMatch(/cancelPromptId/);
  });

  it("busySendMode queue vs send_now wiring exists", () => {
    const ext = read("src/host/extensibility.ts");
    expect(ext).toMatch(/busySendMode/);
    expect(ext).toMatch(/"send_now"/);
    const renderer = read("src/renderer/main.ts");
    expect(renderer).toMatch(/busySendMode/);
    expect(renderer).toMatch(/trigger:\s*"send_now"/);
    expect(renderer).toMatch(/pauseQueue:\s*false/);
    const settings = read("src/renderer/settings-page.ts");
    expect(settings).toMatch(/busySend/);
    const zh = read("src/shared/i18n/locales/zh-CN.ts");
    expect(zh).toMatch(/settings\.busySend/);
  });

  it("turn UI settle state machine (Phase 4) exists", () => {
    const sm = read("src/shared/turn-ui-state.ts");
    expect(sm).toMatch(/shouldPaintStoppedPhase/);
    expect(sm).toMatch(/shouldIgnoreCancelledTurnCompleted/);
    expect(sm).toMatch(/shouldIgnoreLateTurnStarted/);
    expect(sm).toMatch(/resolveBusySendWhileCancelling/);
    const renderer = read("src/renderer/main.ts");
    expect(renderer).toMatch(/alreadyPaintedStopped/);
    expect(renderer).toMatch(/turnUiPhase/);
    expect(renderer).toMatch(/shouldIgnoreCancelledTurnCompleted/);
  });

  it("scheme B: per-session turn projection store exists", () => {
    const store = read("src/renderer/session-turn-store.ts");
    expect(store).toMatch(/SessionTurnProjection/);
    expect(store).toMatch(/shouldRehydrateBusy/);
    expect(store).toMatch(/appendBackgroundAssistantDelta/);
    const renderer = read("src/renderer/main.ts");
    expect(renderer).toMatch(/snapshotActiveSessionTurn/);
    expect(renderer).toMatch(/rehydrateSessionTurnProjection/);
    expect(renderer).toMatch(/skipSessionStoreSync/);
  });

  it("post-cancel: conversation_only rewind only (no Desktop focus system-reminder inject)", () => {
    const renderer = read("src/renderer/main.ts");
    expect(renderer).toMatch(/prepareAgentContentAfterCancel/);
    expect(renderer).toMatch(/pendingPostCancelFocus/);
    expect(renderer).toMatch(/conversation_only/);
    // 禁止回归：把 focus system-reminder 拼进用户 prompt（会落盘进气泡）
    expect(renderer).not.toMatch(
      /Answer ONLY the new standalone user message below/,
    );
    expect(renderer).not.toMatch(
      /was cancelled and removed from active context/,
    );
    const acp = read("src/host/acp-client.ts");
    expect(acp).toMatch(/conversation_only/);
    // paintTurnPhaseDone 须 append 末尾
    expect(renderer).toMatch(
      /钉回末尾|钉在 transcript \*\*末尾\*\*|root\.appendChild\(turnPhaseEl\)/,
    );
  });

  it("history resync policy: arm does not clear stop block; no bleed poison", () => {
    const policy = read("src/shared/history-resync-policy.ts");
    expect(policy).toMatch(/armClearsHistoryResyncBlock/);
    expect(policy).toMatch(/shouldSkipHistoryResync/);
    expect(policy).toMatch(/assistantsAfterLastUser/);
    const renderer = read("src/renderer/main.ts");
    expect(renderer).toMatch(/shouldSkipHistoryResync/);
    expect(renderer).toMatch(/history-resync-policy/);
    // 禁止回归词级毒化
    expect(renderer).not.toMatch(/looksLikeStoppedTurnBleed|purgePoisonedTurnUi|bleedFingerprints/);
    const acp = read("src/host/acp-client.ts");
    expect(acp).not.toMatch(/bleedFingerprints|filterAssistantBleed|looksLikeCancelledBleed/);
  });
});
