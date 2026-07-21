import { describe, expect, it } from "vitest";
import {
  extractPermissionOptions,
  resolvePermissionOptionId,
} from "../src/host/permission-options.js";

describe("permission-options", () => {
  const bashDesktop = [
    { optionId: "enable-always-approve", kind: "allow_once", name: "always-approve mode" },
    { optionId: "allow-always-command", kind: "allow_always", name: "Always allow: curl" },
    { optionId: "allow-once", kind: "allow_once", name: "Yes, proceed" },
    { optionId: "reject-once", kind: "reject_once", name: "No" },
    { optionId: "reject-always-command", kind: "reject_always", name: "Never allow" },
  ];

  it("YOLO allow_once skips enable-always-approve and picks allow-once", () => {
    expect(resolvePermissionOptionId("allow_once", bashDesktop)).toBe("allow-once");
  });

  it("deny picks reject-once", () => {
    expect(resolvePermissionOptionId("deny", bashDesktop)).toBe("reject-once");
  });

  it("allow_always prefers allow-always-command", () => {
    expect(resolvePermissionOptionId("allow_always", bashDesktop)).toBe(
      "allow-always-command",
    );
  });

  it("accepts underscore ids from fake agent", () => {
    const opts = [
      { optionId: "allow_once", name: "Allow once" },
      { optionId: "reject", name: "Reject" },
    ];
    expect(resolvePermissionOptionId("allow_once", opts)).toBe("allow_once");
    expect(resolvePermissionOptionId("deny", opts)).toBe("reject");
  });

  it("empty options falls back to underscore legacy", () => {
    expect(resolvePermissionOptionId("allow_once", [])).toBe("allow_once");
    expect(resolvePermissionOptionId("deny", [])).toBe("reject");
  });

  it("extractPermissionOptions reads options array", () => {
    const params = {
      options: [{ optionId: "allow-once" }, { option_id: "reject-once" }],
    };
    const list = extractPermissionOptions(params);
    expect(list).toHaveLength(2);
  });
});
