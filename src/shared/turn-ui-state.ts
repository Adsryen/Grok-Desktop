/**
 * Turn UI 结算状态机（CLI 对齐计划 Phase 4）。
 *
 * Desktop 允许乐观 Stop（先 paint「已停止」），Host 异步 cancel。
 * 权威约束：
 * - 同一 stop 只 paint 一次 stopped phase
 * - Cancelling 期间二次 Stop join，不双条
 * - 迟到 turn.completed(cancelled) 只清 working，不再 endTurn
 * - 迟到 turn.started / session.working 在 suppress/cancelling 下不复活 turn
 *
 * 状态：
 * - idle：无进行中 turn
 * - working：beginTurn 后、未 stop
 * - cancelling：用户已点 stop，host cancel 未完成（可与 UI 已 idle 并存）
 */

export type TurnUiPhase = "idle" | "working" | "cancelling";

/** 是否应再画一条「已停止」phase */
export function shouldPaintStoppedPhase(opts: {
  /** 本 stop 是否已乐观画过 stopped */
  alreadyPaintedStopped: boolean;
}): boolean {
  return !opts.alreadyPaintedStopped;
}

/**
 * 收到 turn.completed(cancelled) 时：是否跳过 endTurn / 二次 paint，
 * 仅做 working 清理。
 */
export function shouldIgnoreCancelledTurnCompleted(opts: {
  turnActive: boolean;
  alreadyPaintedStopped: boolean;
  userStopSuppressed: boolean;
  isCancelled: boolean;
}): boolean {
  if (opts.turnActive) return false;
  if (opts.alreadyPaintedStopped) return true;
  if (opts.userStopSuppressed) return true;
  if (opts.isCancelled) return true;
  return false;
}

/**
 * 无活跃 turn 时迟到 turn.started：是否丢弃（勿 beginTurn 复活）。
 * 已有 turn 时返回 false（应走 arm 路径）。
 */
export function shouldIgnoreLateTurnStarted(opts: {
  turnActive: boolean;
  userStopSuppressed: boolean;
  phase: TurnUiPhase;
}): boolean {
  if (opts.turnActive) return false;
  if (opts.userStopSuppressed) return true;
  if (opts.phase === "cancelling") return true;
  return false;
}

/** 迟到 session.status=working：是否忽略（勿侧栏转圈复活） */
export function shouldIgnoreLateSessionWorking(opts: {
  userStopSuppressed: boolean;
  phase: TurnUiPhase;
  eventBelongsToActiveSession: boolean;
}): boolean {
  if (!opts.eventBelongsToActiveSession) return false;
  if (opts.userStopSuppressed) return true;
  if (opts.phase === "cancelling") return true;
  return false;
}

/**
 * Cancelling 中二次 cancel：应 join 已有 in-flight，不新开一条。
 */
export function shouldJoinInFlightCancel(opts: {
  cancelInFlight: boolean;
}): boolean {
  return opts.cancelInFlight;
}

/**
 * Cancelling / 刚 stop 后发送：busy 策略。
 * - queue：可入队（turn 可能已 idle）
 * - send_now：须等 cancel 完成再发
 * - 无草稿 stop：join cancel 即可
 */
export type BusySendWhileCancelling =
  | "join_only"
  | "wait_then_send"
  | "enqueue"
  | "send_idle";

export function resolveBusySendWhileCancelling(opts: {
  cancelInFlight: boolean;
  turnActive: boolean;
  hasDraft: boolean;
  busySendMode: "queue" | "send_now";
}): BusySendWhileCancelling {
  if (opts.cancelInFlight) {
    if (!opts.hasDraft) return "join_only";
    if (opts.busySendMode === "send_now") return "wait_then_send";
    return "enqueue";
  }
  if (opts.turnActive) {
    if (!opts.hasDraft) return "join_only"; // 走 stop
    if (opts.busySendMode === "send_now") return "wait_then_send";
    return "enqueue";
  }
  return "send_idle";
}
