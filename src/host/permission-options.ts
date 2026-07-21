/**
 * 将 Host 决策映射为 agent 在 session/request_permission 里给出的 optionId。
 *
 * Grok Build 使用连字符 id：allow-once / reject-once / allow-always-command 等；
 * 旧客户端与 fake agent 可能用下划线 allow_once。禁止写死单一字符串。
 */

export type PermissionDecisionWire =
  | "allow_once"
  | "allow_session"
  | "allow_always"
  | "deny";

export type PermissionOptionLike = {
  optionId?: string;
  option_id?: string;
  id?: string;
  name?: string;
  kind?: string;
  label?: string;
};

function optionIdOf(o: PermissionOptionLike): string {
  const id = o.optionId ?? o.option_id ?? o.id;
  return typeof id === "string" ? id.trim() : "";
}

function optionKindOf(o: PermissionOptionLike): string {
  return String(o.kind ?? "").toLowerCase();
}

function optionLabelOf(o: PermissionOptionLike): string {
  return String(o.name ?? o.label ?? "").toLowerCase();
}

/** 从 request params 抽出 options 数组 */
export function extractPermissionOptions(
  params: Record<string, unknown> | null | undefined,
): PermissionOptionLike[] {
  if (!params || typeof params !== "object") return [];
  const raw = params.options ?? params.permissionOptions ?? params.permission_options;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as PermissionOptionLike[];
}

/**
 * 按 decision 在 options 中选合法 optionId。
 * YOLO / 用户点「允许」→ allow；拒绝 → reject。
 */
export function resolvePermissionOptionId(
  decision: PermissionDecisionWire,
  options: PermissionOptionLike[] | undefined | null,
): string {
  const list = (options ?? []).filter((o) => optionIdOf(o));
  const deny = decision === "deny";

  if (!list.length) {
    // 无列表时的兼容回落（fake / 旧 agent）
    if (deny) return "reject";
    if (decision === "allow_always") return "allow_always";
    if (decision === "allow_session") return "allow_session";
    return "allow_once";
  }

  const ids = list.map(optionIdOf);

  const findById = (...cands: string[]): string | null => {
    for (const c of cands) {
      const hit = ids.find((id) => id === c || id.toLowerCase() === c.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };

  const findByKind = (...kinds: string[]): string | null => {
    for (const o of list) {
      const k = optionKindOf(o);
      if (kinds.some((x) => k === x.toLowerCase() || k.includes(x.toLowerCase()))) {
        const id = optionIdOf(o);
        if (id) return id;
      }
    }
    return null;
  };

  // 特殊：enable-always-approve 对 shell 等价 AllowOnce，但会触发客户端 YOLO 副作用；
  // Host YOLO 自动批应跳过它，选真正的 allow-once。
  const isYoloEnable = (id: string) =>
    id === "enable-always-approve" || id.toLowerCase() === "enable-always-approve";

  if (deny) {
    return (
      findById("reject-once", "reject", "reject_once", "deny") ??
      findByKind("rejectonce", "reject_once", "rejectalways", "reject_always", "reject") ??
      list
        .map(optionIdOf)
        .find((id) => /reject|deny|no/i.test(id) && !isYoloEnable(id)) ??
      list.find((o) => /reject|deny|no|不要/i.test(optionLabelOf(o)))?.optionId ??
      optionIdOf(list[list.length - 1]!) ??
      "reject"
    );
  }

  // allow_always / allow_session：优先持久允许类
  if (decision === "allow_always" || decision === "allow_session") {
    const sticky =
      findById(
        "allow-always-command",
        "always-allow",
        "allow-always",
        "allow_always",
        "allow-always-mcp",
        "allow-always-domain",
        "allow-edits-session",
        "allow_session",
        "allow-session",
      ) ??
      findByKind("allowalways", "allow_always") ??
      list
        .map(optionIdOf)
        .find(
          (id) =>
            /always|session/i.test(id) &&
            !/reject|deny/i.test(id) &&
            !isYoloEnable(id),
        );
    if (sticky) return sticky;
    // 没有 sticky 则降级 allow once
  }

  // allow_once / 默认允许：跳过 enable-always-approve
  const once =
    findById("allow-once", "allow_once", "allow", "proceed", "yes") ??
    findByKind("allowonce", "allow_once", "allow") ??
    list
      .map(optionIdOf)
      .find(
        (id) =>
          /allow|proceed|yes|once/i.test(id) &&
          !/reject|deny|never/i.test(id) &&
          !isYoloEnable(id),
      ) ??
    list
      .map(optionIdOf)
      .find((id) => !/reject|deny|never/i.test(id) && !isYoloEnable(id));

  if (once) return once;

  // 最后：若只剩 enable-always-approve，仍可用（shell 当 AllowOnce）
  const yolo = findById("enable-always-approve");
  if (yolo) return yolo;

  return optionIdOf(list[0]!) || "allow-once";
}
