# Desktop 对齐 CLI 计划（仅适合对齐的部分）

> **日期**：2026-07-22  
> **原则**：对齐 **agent 契约 + 用户回合语义**；不抄 **Leader 拓扑 / TUI / 内部实现细节**。  
> **工程流程（强制）**：**先 CLI 调研 → 再 Desktop 方案 → 再实现**（仓库根 `AGENTS.md`）。  
> **相关**：`docs/cli-desktop-capability-matrix.md`、`docs/架构与协议.md`  
> **背景**：停止串流（玻璃→停→苹果）暴露 cancel/跨 turn 边界未当协议面验收；P0–P2 已补入口 meta 与去毒化。

---

## 0. 对齐边界（先定什么做 / 不做）

### 0.1 必须对齐（协议 + 语义）

| ID | 主题 | 对齐什么 | 不抄什么 |
|----|------|----------|----------|
| A1 | Cancel wire | `session/cancel` + `_meta` 完整、可分支 | CLI 内部 `SessionCommand` 结构 |
| A2 | 停止语义 | 停当前 turn + 默认 subagent；默认不清队列 | 杀光 background 的默认策略 |
| A3 | 跨 turn 隔离 | T1 残留不得画进 / 贴进 T2 | 词级毒化、长 quiet drain |
| A4 | Interrupt 队列 | 保留队列 + pause 自动 drain | CLI queue 方法名 / 多端广播 |
| A5 | 单次结算 | cancelled 只呈现一次「已停止」 | 禁止 Desktop 乐观 UI |

### 0.2 半对齐（语义同、形态 Desktop 化）

| ID | 主题 | Desktop 形态 |
|----|------|----------------|
| B1 | `cancelTrigger` | `stop` / `esc` / `send_now` 分流，非必须 `ctrl_c` |
| B2 | 发送打断 | 明确「排队」vs「打断并发送」 |
| B3 | `cancelPromptId` | 有 in-flight / 队列时带上，便于 agent 归因 |
| B4 | `rewindIfPristine` | 默认 false；可选「几乎无产出秒停」再开 |
| B5 | history 边界 | 按 generation / 最后 user 边界回补，不靠关键词 |

### 0.3 不对齐（刻意差异）

| ID | 主题 | 原因 |
|----|------|------|
| C1 | Leader 进程池 | Mode B 每会话一进程：隔离与生命周期更清晰 |
| C2 | `clientCapabilities.terminal` 全开 | 无产品内嵌 agent 终端前不硬开 |
| C3 | leader 注入 meta（autoMode / codeNav…） | 按产品需要再开 |
| C4 | Hooks / plugins / dream 全事件 | 路线图按需，非 cancel 前置 |
| C5 | 默认 `kill_background_tasks` | 桌面更宜保留会话级后台，仅销毁会话时强杀 |
| C6 | 内容指纹 / quarantine | 已证伪；禁止回归 |

---

## 1. 现状快照（2026-07-22）

| 项 | 状态 | 说明 |
|----|------|------|
| `session/cancel` + `cancelSubagents` / `cancelTrigger` / `rewindIfPristine:false` | ✅ P0 | `acp-client.ts` |
| generation gate 隔离、去毒化 | ✅ P0 | Host + Renderer |
| interrupt 保留队列 + pause | ✅ P2 | `queuePausedByInterrupt` |
| cancel join（Cancelling 可重试） | ✅ P2 | Host + Renderer in-flight |
| trigger 从 UI 真实分流 | ✅ Phase1 | Stop→`stop` · Esc→`esc` |
| `turns.cancel` 透传 trigger / promptId | ✅ Phase1 | IPC + `host.turnsCancel` |
| send_now（打断并发送） | ✅ Phase2 | 设置 `busySendMode` + cancel trigger |
| `cancelPromptId` | ✅ Phase1 | 每 prompt 生成；cancel `_meta` 带回（mid-turn） |
| history 与 generation 一致契约 | ✅ Phase3 | policy 模块 + arm 不解除 block |
| cancel 契约测试（fake agent） | ✅ Phase1 | `host-acp` + `FAKE_ACP_CANCEL_LOG` |
| 矩阵 Cancel / 多会话负例 N1–N11 | ✅ | 2026-07-22 真 agent 手工通过；见矩阵 B.3 |

---

## 2. 分阶段计划

### Phase 0 — 基线冻结（已完成 / 只维护）

**目标**：不再用内容毒化修串流；cancel 入口至少带齐默认 meta。

**已交付**：

- [x] `session/cancel` `_meta`：`cancelSubagents: true`、`cancelTrigger`、`rewindIfPristine: false`
- [x] 去掉 bleed fingerprint / soft filter / quarantine
- [x] 短 quiet + generation gate
- [x] UI interrupt 队列 + cancelInFlight join
- [x] suppress 窗口缩短；history block 随 arm / 干净流解除

**维护规则**：

- 禁止再引入「用户词 / 助手指纹」拦截串流
- 新 bug 优先查：meta 是否到达 agent、gate 开闭、history 回补时机

**验收**：

- 手工：`玻璃` → 停 → `苹果`：无串流、无双条已停止、不卡死「思考中」、不无故截断

---

### Phase 1 — Cancel 契约补全（P1 · 协议）✅ 2026-07-22

**目标**：Desktop 发出的 cancel 与 CLI 客户端等价（字段级），且 UI 入口可区分 trigger。

#### 1.1 IPC / Host 透传

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1.1.1 | `turns.cancel` 可选 `trigger` / `cancelPromptId` | ✅ |
| 1.1.2 | `AcpClient.cancel` → `_meta` 全字段 | ✅ |
| 1.1.3 | 停止钮 → `stop`；Esc → `esc` | ✅ |

#### 1.2 cancelPromptId（轻量）

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1.2.1 | 每 prompt 生成 `p_<uuid>` | ✅ |
| 1.2.2 | 写入 `session/prompt` `_meta.promptId` | ✅ |
| 1.2.3 | cancel `_meta.cancelPromptId` 带回 | ✅ |

#### 1.3 契约测试

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1.3.1 | `FAKE_ACP_CANCEL_LOG` + `FAKE_ACP_SLOW_PROMPT` | ✅ |
| 1.3.2 | assert cancelSubagents / cancelTrigger / cancelPromptId | ✅ |
| 1.3.3 | 二次 cancel 不抛 | ✅ |

**成功标准**：全部已勾选。

**非目标**：`rewindIfPristine: true`、杀 background。

---

### Phase 2 — 发送策略与队列（P1 · 产品语义）✅ 2026-07-22

**目标**：忙时发送行为与 CLI/Codex 可预期，且与 cancelTrigger 联动。

#### 2.1 明确两种策略

| 策略 | 用户动作 | 行为 | cancelTrigger |
|------|----------|------|----------------|
| Queue（默认） | turn 中再发送 | 入队，不 cancel | — |
| Send-now | 设置「打断并发送」 | cancel 当前 → 发新 prompt | `send_now` |

#### 2.2 实现要点

| 步骤 | 内容 | 状态 |
|------|------|------|
| 2.2.1 | `dispatchAgentPrompt` 支持 `interrupt: "send_now"` | ✅ |
| 2.2.2 | `sendContinue`：`busySendMode` 分流 | ✅ |
| 2.2.3 | send_now：`pauseQueue: false`，不 pause 队列 | ✅ |
| 2.2.4 | 普通 Stop / Esc：仍 pause 队列 | ✅ |
| 2.2.5 | 设置页 `busySendMode` + config 持久化 | ✅ |

#### 2.3 文案 / 设置（最小）

- 设置 → 通用 →「忙碌时发送」：加入队列 / 打断并发送
- 不做 share、不做多端 queue 同步

**成功标准**：

- [x] 默认 queue：忙时发送 → 入队
- [x] send_now：cancel(send_now) 后立即发，不 pause 队列
- [x] Stop：队列保留且 paused，可 resume

**非目标**：L2 agent `x.ai/queue/*` 全量 wire（可另开 Phase）。

---

### Phase 3 — 回合边界与 history（P1 · 正确性）✅ 2026-07-22

**目标**：直播与落盘回补共用同一「回合边界」，消灭二次贴玻璃。

#### 3.1 边界定义

- **直播**：仅 `streamAcceptGeneration === activePromptGeneration` 且已 arm 可画
- **history 回补**：仅允许「当前时间线最后一条 user 之后」且 **非** stop-suppress / block 窗口内
- **arm 不解除** `blockHistoryResyncAfterStop`；仅干净助手流解除
- **禁止**：对助手正文做 cancelled-subject 关键词过滤

#### 3.2 实现要点

| 步骤 | 内容 | 状态 |
|------|------|------|
| 3.2.1 | `history-resync-policy.ts` + arm 不 clear block | ✅ |
| 3.2.2 | `assistantsAfterLastUser` + timeline user 对齐 | ✅ |
| 3.2.3 | stop 后 skip `afterTurnSettled`；正常完成仍 resync | ✅ |
| 3.2.4 | Host `acp.cancel` 日志（trigger / promptId / gen） | ✅ |

#### 3.3 回归用例（手工 + 自动化策略测）

1. 玻璃 → 停 → 苹果：苹果下无玻璃长文（策略 + block）  
2. 正常长回复完成：无「丢最后一泡」（block=false 可 resync）  
3. 停后不发新消息：block 保持，不 resync  
4. 无词级毒化回归（contract-audit）

**成功标准**：策略单测 + 契约通过；无毒化代码。

---

### Phase 4 — 结算状态机收敛（P2 · UX 稳）✅ 2026-07-22

**目标**：乐观 Stop 保留响应，权威状态不双写打架。

| 步骤 | 内容 | 状态 |
|------|------|------|
| 4.1 | `turn-ui-state.ts`：idle / working / cancelling + 文档 | ✅ |
| 4.2 | Cancelling join；busy send 策略 resolve | ✅ |
| 4.3 | `alreadyPaintedStopped` + ignore cancelled completed | ✅ |
| 4.4 | 迟到 turn.started / session.working 在 suppress/cancelling 丢弃 | ✅ |

**状态机（UI）**：

```
idle ──beginTurn──► working ──cancelTurn──► cancelling ──cancel done──► idle
                      │                         │
                      └── endTurn(worked) ──────┴──► idle
乐观 stop：cancelling 期间 turnActive=false，alreadyPaintedStopped=true
迟到 cancelled completed：只清 working，不 paint
```

**成功标准**：

- [x] 策略单测：单次 paint / join cancel / 丢弃迟到 started
- [x] 契约：renderer 接线 alreadyPaintedStopped / turnUiPhase

---

### Phase 5 — 可选增强（P2 · 按需）

仅在产品需要时做，**默认不做**。

| 项 | 何时做 | 说明 |
|----|--------|------|
| `rewindIfPristine: true` | 用户抱怨「空停仍脏历史」 | 仅无 tool / 无实质助手文本时 |
| 销毁会话时 `kill_background_tasks` | 关会话后仍有残留任务 | 仅 detach/delete 路径 |
| L2 QueueChanged / agent queue wire | 多端或 CLI 同 session | 另立项 |
| interrupt reminder 依赖 | 升级 agent 后仍续写旧题 | 优先确认 agent cancel 路径，少在 Desktop 注入系统句 |
| 矩阵 M7–M9 等 meta | 对应功能立项 | 不绑 cancel |

---

## 3. 建议实施顺序与依赖

```text
Phase 0（已完成）
    │
    ▼
Phase 1  Cancel 契约 + trigger/promptId     ← 低成本、防回退
    │
    ├──────────────► Phase 4  结算状态机（可与 1 并行收尾）
    │
    ▼
Phase 2  队列 / send_now                   ← 依赖 1 的 trigger 透传
    │
    ▼
Phase 3  history 边界契约 + 回归           ← 依赖 0 去毒化，不依赖 2
    │
    ▼
Phase 5  可选增强
```

**推荐落地切片（PR 粒度）**：

| PR | 内容 | 验证 |
|----|------|------|
| PR-A | Phase 1：IPC trigger + Esc/Stop + 契约测 | fake agent assert meta |
| PR-B | Phase 4：结算/ Cancelling 文档化 + 连点 Stop | 手工 |
| PR-C | Phase 2：send_now + 设置默认 queue | 手工三种路径 |
| PR-D | Phase 3：history 契约 + 回归清单写入矩阵 | 玻璃→停→苹果 |

---

## 4. 验收清单（矩阵负例 · 与 B.3 同源）

权威表见 [cli-desktop-capability-matrix.md](./cli-desktop-capability-matrix.md) **主战场 B.3**。  
**2026-07-22：N1–N11 真 agent 手工全部通过。** 改 cancel / 多会话 / history 后须重跑。

| # | 场景 | 期望 | 结果 |
|---|------|------|------|
| N1 / N-Stop-1 | 玻璃→停→苹果 | 无 T1 串到 T2 直播 | ✅ |
| N2 / N-Stop-2 | 同上 | 无 T1 经 history 贴到 T2；无 Desktop focus system-reminder 进用户气泡 | ✅ |
| N3 / N-Stop-3 | 点停 | 仅一条「已停止」 | ✅ |
| N4 / N-Stop-4 | 点停后发新问 | 不卡「思考中」>3s（无网除外） | ✅ |
| N5 / N-Stop-5 | 忙时默认发送 | 入队，当前不 cancel | ✅ |
| N6 / N-Stop-6 | send_now | 当前 cancel + 新 prompt 发出 | ✅ |
| N7 / N-Stop-7 | Stop 时有队列 | 队列保留且 paused，可继续 | ✅ |
| N8 / N-Stop-8 | 连点 Stop | join，无报错风暴 | ✅ |
| N9 | A 运行→切 B→回 A（A 仍跑） | 主区 busy，侧栏 A working | ✅ |
| N10 | A 运行→切 B→A 完成后回 A | 主区 idle，无假「工作中」 | ✅ |
| N11 | A 运行→新对话 keepBackground | A 侧栏仍 working；欢迎页可发 | ✅ |

---

## 5. 明确不做（本计划范围外）

- 改为 Leader 共享 agent 进程池  
- 为对齐而开启 terminal / autoMode / codeNav  
- 恢复任何内容毒化 / quarantine  
- 默认 cancel 时 rewind 或杀全部 background  
- 一次性映射全部 x.ai 扩展事件  

---

## 6. 成功定义（整计划完成时）

1. **契约**：Desktop `session/cancel` 的 `_meta` 与 CLI 客户端字段集兼容，且有自动化断言。  
2. **语义**：Stop / 排队 / 打断发送 三种路径用户可预期，与 CLI 心智一致。  
3. **正确性**：跨 turn 隔离稳定，不靠关键词。  
4. **形态**：仍为 Mode B + 乐观 UI + Desktop history，不伪装成 TUI。  

---

## 7. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-22 | 初稿：基于 stop 串流复盘与「适合对齐」讨论；Phase 0 = P0–P2 已交付 |
| 2026-07-22 | **Phase 1 落地**：IPC trigger/promptId、Stop/Esc 分流、fake cancel log + host-acp 契约 |
| 2026-07-22 | **Phase 2 落地**：busySendMode queue/send_now、设置页、sendContinue 分流 |
| 2026-07-22 | **Phase 3 落地**：history-resync-policy、arm 不 clear block、契约禁毒化 |
| 2026-07-22 | **Phase 4 落地**：turn-ui-state、alreadyPaintedStopped、Cancelling join |
| 2026-07-22 | **根因**：`session/cancel` 被当成 request 发送 → 真实 agent `Method not found`；改为 ACP **notification**（`notify`） |
| 2026-07-22 | **方案 B**：per-session turn 投影（`session-turn-store`）；切走快照 / 切回 rehydrate busy |
| 2026-07-22 | **N1–N11 验收通过**（真 agent）；矩阵 B 区闭环；移除 Desktop focus system-reminder 拼进用户 prompt |
