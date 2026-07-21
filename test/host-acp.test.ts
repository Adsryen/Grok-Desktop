import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopHost } from "../src/host/host.js";
import type { NormalizedEvent } from "../src/shared/events.js";
import { HostError } from "../src/shared/errors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeAgent = path.join(here, "fake-acp-agent.mjs");
const nodeBin = process.execPath;

const hosts: DesktopHost[] = [];

afterEach(async () => {
  while (hosts.length) {
    const h = hosts.pop()!;
    await h.dispose();
  }
});

function makeHost(env: NodeJS.ProcessEnv = {}): DesktopHost {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "grok-desktop-home-"));
  const host = new DesktopHost({
    home,
    grokPath: nodeBin,
    agentArgs: [fakeAgent],
    env: { ...process.env, ...env },
  });
  hosts.push(host);
  return host;
}

describe("DesktopHost + ACP (shipped path)", () => {
  it("resolves agent, creates Thread, prompts, and emits normalized events", async () => {
    const host = makeHost();
    const events: NormalizedEvent[] = [];
    host.subscribe((e) => events.push(e));

    const info = host.grokInfo();
    expect(info.path).toBe(nodeBin);
    expect(info.source).toBe("override");

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "grok-desktop-cwd-"));
    const created = await host.threadsCreate({
      cwd,
      title: "test-thread",
      prompt: "ping",
    });

    expect(created.threadId.startsWith("thread_")).toBe(true);
    expect(created.sessionId.length).toBeGreaterThan(4);
    expect(created.cwd).toBe(path.resolve(cwd));

    const types = events.map((e) => e.type);
    expect(types).toContain("turn.started");
    expect(types).toContain("message.delta");
    expect(types).toContain("thought.delta");
    expect(types).toContain("tool.started");
    expect(types).toContain("turn.completed");

    const msg = events.find(
      (e) => e.type === "message.delta" && e.text.includes("pong"),
    );
    expect(msg).toBeTruthy();

    const listed = host.listThreads();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.threadId);
    expect(listed[0].sessionId).toBe(created.sessionId);
  });

  it("completes permissions.respond roundtrip when agent asks", async () => {
    const host = makeHost({ FAKE_ACP_ASK_PERMISSION: "1" });
    const events: NormalizedEvent[] = [];
    host.subscribe((e) => events.push(e));

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "grok-desktop-perm-"));

    const promptPromise = host.threadsCreate({
      cwd,
      prompt: "need permission",
    });

    // Wait for permission.requested
    let requestId: string | null = null;
    for (let i = 0; i < 50 && !requestId; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const perm = events.find((e) => e.type === "permission.requested");
      if (perm && perm.type === "permission.requested") {
        requestId = perm.requestId;
      }
    }
    expect(requestId).toBeTruthy();

    host.permissionsRespond(requestId!, "allow_once");
    const created = await promptPromise;
    expect(created.sessionId).toBeTruthy();

    const statuses = events
      .filter((e) => e.type === "session.status")
      .map((e) => (e.type === "session.status" ? e.status : ""));
    expect(statuses).toContain("needs_input");
    expect(statuses).toContain("idle");
  });

  it("threadsAttach is idempotent when already live (no SESSION_BUSY)", async () => {
    const host = makeHost();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "grok-desktop-busy-"));
    const created = await host.threadsCreate({ cwd, prompt: "x" });

    // Mode B：ensureLive 可重复 attach；已 live 则返回同一 threadId（幂等）
    const again = await host.threadsAttach(created.sessionId, cwd);
    expect(again.threadId).toBe(created.threadId);
    const ping = host.threadsPing(created.threadId);
    expect(ping.ok).toBe(true);
    expect(ping.alive).toBe(true);
  });

  it("returns structured HostError for missing binary", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "grok-desktop-nobin-"));
    const host = new DesktopHost({
      home,
      grokPath: path.join(home, "no-such-grok-binary"),
      env: { PATH: home },
    });
    hosts.push(host);

    await expect(
      host.threadsCreate({
        cwd: home,
        prompt: "x",
      }),
    ).rejects.toBeInstanceOf(HostError);

    try {
      await host.threadsCreate({ cwd: home, prompt: "x" });
    } catch (e) {
      expect(e).toBeInstanceOf(HostError);
      expect((e as HostError).code).toBe("BINARY_NOT_FOUND");
      expect((e as HostError).toJSON().code).toBe("BINARY_NOT_FOUND");
    }
  });

  it("threadsCompact and threadsSessionInfo via ACP ext methods", async () => {
    const host = makeHost();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "grok-desktop-compact-"));
    const created = await host.threadsCreate({ cwd, prompt: "ping" });

    const compact = await host.threadsCompact(created.threadId, {
      userContext: "keep paths",
    });
    expect(compact.ok).toBe(true);
    expect(compact.sessionId).toBe(created.sessionId);

    const info = await host.threadsSessionInfo(created.threadId);
    expect(info.sessionId).toBe(created.sessionId);
    expect(info.model).toBe("fake-model");
    expect(info.context.total).toBe(128000);
    expect(info.context.used).toBe(1200);
    expect(info.context.autoCompactThresholdPercent).toBe(85);
    expect(info.context.usageCategories.length).toBeGreaterThan(0);
  });

  it("threadsKillTask via ACP x.ai/task/kill", async () => {
    const host = makeHost();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "grok-desktop-kill-"));
    const created = await host.threadsCreate({ cwd, prompt: "ping" });

    const killed = await host.threadsKillTask(created.threadId, "task-fake-1");
    expect(killed.sessionId).toBe(created.sessionId);
    expect(killed.taskId).toBe("task-fake-1");
    expect(killed.outcome).toBe("killed");
  });

  it("threadsMemoryFlush via ACP x.ai/memory/flush", async () => {
    const host = makeHost();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "grok-desktop-mem-"));
    const created = await host.threadsCreate({ cwd, prompt: "ping" });
    const flushed = await host.threadsMemoryFlush(created.threadId);
    expect(flushed.ok).toBe(true);
    expect(flushed.sessionId).toBe(created.sessionId);
  });
});
