/**
 * History 回补策略（CLI 对齐计划 Phase 3）。
 *
 * 直播靠 Host generation gate；history 回补另有边界，二者都禁止词级毒化。
 *
 * 契约：
 * 1. 用户 Stop 后：blockAfterStop=true，禁止 resync，直到本轮出现干净助手流。
 * 2. armTurn（闸门打开）只收流，**不**解除 blockAfterStop（避免 T2 空完成时贴上 T1 落盘）。
 * 3. 仅回补「最后一条 user 之后」的 assistant。
 * 4. 本 turn 已流式画过助手 → 禁止 resync（防重复气泡）。
 */

export type HistoryRoleEntry = {
  role?: string;
  text?: string;
};

/** 是否应跳过 history 回补 */
export function shouldSkipHistoryResync(opts: {
  /** 本 turn 已流式输出过助手正文 */
  assistantStartedThisTurn: boolean;
  /** 用户停止 suppress 窗口内 */
  userStopSuppressed: boolean;
  /** Stop 后尚未见干净助手流 */
  blockAfterStop: boolean;
}): boolean {
  if (opts.assistantStartedThisTurn) return true;
  if (opts.userStopSuppressed) return true;
  if (opts.blockAfterStop) return true;
  return false;
}

/**
 * arm 是否应解除 blockAfterStop。
 * 契约：false — 只靠干净助手流 / 显式解除。
 */
export function armClearsHistoryResyncBlock(): boolean {
  return false;
}

/** 文本是否算「干净助手流」足以解除 stop 后 history 封锁 */
export function isCleanAssistantStreamForResyncUnlock(
  text: string,
  minLen = 8,
): boolean {
  return text.replace(/\s+/g, " ").trim().length >= minLen;
}

/** 角色是否为 user */
export function isUserHistoryRole(role: string | undefined): boolean {
  const r = String(role ?? "").toLowerCase();
  return r === "user" || r === "human";
}

/** 角色是否为 assistant */
export function isAssistantHistoryRole(role: string | undefined): boolean {
  const r = String(role ?? "").toLowerCase();
  return r === "assistant" || r === "ai";
}

/** 最后一条 user 的下标；无则 -1 */
export function findLastUserIndex(entries: HistoryRoleEntry[]): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isUserHistoryRole(entries[i]?.role)) return i;
  }
  return -1;
}

/**
 * 取最后一条 user 之后的 assistant 文本（已 trim，过滤过短）。
 * 不在此处做 cancelled-subject 关键词过滤。
 */
export function assistantsAfterLastUser(
  entries: HistoryRoleEntry[],
  opts?: { minTextLen?: number },
): string[] {
  const minLen = opts?.minTextLen ?? 8;
  const lastUserIdx = findLastUserIndex(entries);
  const out: string[] = [];
  for (let i = lastUserIdx + 1; i < entries.length; i++) {
    const e = entries[i];
    if (!isAssistantHistoryRole(e?.role)) continue;
    const text = String(e?.text ?? "").trim();
    if (!text || text.length < minLen) continue;
    out.push(text);
  }
  return out;
}

/**
 * 历史最后一条 user 正文是否与时间线最后一条 user 大致一致。
 * 不一致时跳过 resync，避免切会话竞态或视图代次错位贴错泡。
 */
export function historyLastUserMatchesTimeline(
  historyEntries: HistoryRoleEntry[],
  timelineLastUser: string,
  normalize: (s: string) => string = defaultNormUser,
): boolean {
  const tl = normalize(timelineLastUser);
  if (!tl) return true; // 无时间线 user 时不额外拦
  let lastHist = "";
  for (let i = historyEntries.length - 1; i >= 0; i--) {
    if (isUserHistoryRole(historyEntries[i]?.role)) {
      lastHist = normalize(String(historyEntries[i]?.text ?? ""));
      break;
    }
  }
  if (!lastHist) return true;
  if (lastHist === tl) return true;
  // 前缀/截断容差（UI 可能只显示 80 字）
  if (lastHist.startsWith(tl) || tl.startsWith(lastHist)) return true;
  return false;
}

function defaultNormUser(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 120);
}
