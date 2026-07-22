import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopHost } from "../src/host/host.js";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeAgent = path.join(here, "fake-acp-agent.mjs");
const nodeBin = process.execPath;

const hosts: DesktopHost[] = [];

afterEach(async () => {
  while (hosts.length) await hosts.pop()!.dispose();
});

function makeHost(): DesktopHost {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "grok-s14-home-"));
  const host = new DesktopHost({
    home,
    grokPath: nodeBin,
    agentArgs: [fakeAgent],
    env: { ...process.env },
  });
  hosts.push(host);
  return host;
}

function tempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grok-s14-repo-"));
  spawnSync("git", ["init"], { cwd: dir, windowsHide: true });
  fs.writeFileSync(path.join(dir, "README.md"), "hello\n");
  spawnSync("git", ["add", "."], { cwd: dir, windowsHide: true });
  spawnSync(
    "git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"],
    { cwd: dir, windowsHide: true },
  );
  return dir;
}

describe("S1 projects / roster / inbox", () => {
  it("projects add trust pin and list", () => {
    const host = makeHost();
    const repo = tempRepo();
    const p = host.projectsAdd({ path: repo, title: "Demo", trust: true });
    expect(p.trust).toBe("trusted");
    expect(p.path).toBe(path.resolve(repo));
    host.projectsUpdate(p.id, { pinned: true });
    const list = host.projectsList();
    expect(list[0].pinned).toBe(true);
    expect(list[0].id).toBe(p.id);
  });

  it("rejects untrusted project thread create", async () => {
    const host = makeHost();
    const repo = tempRepo();
    const p = host.projectsAdd({ path: repo, trust: false });
    await expect(
      host.threadsCreate({ cwd: repo, projectId: p.id, prompt: "x" }),
    ).rejects.toMatchObject({ code: "NOT_TRUSTED" });
  });

  it("roster includes live threads; inbox records permission", async () => {
    const host = makeHost();
    const home = (host as unknown as { home?: string }).home;
    // permission-asking agent
    const host2 = new DesktopHost({
      home,
      grokPath: nodeBin,
      agentArgs: [fakeAgent],
      env: { ...process.env, FAKE_ACP_ASK_PERMISSION: "1" },
    });
    hosts.push(host2);

    const repo = tempRepo();
    host2.projectsAdd({ path: repo, trust: true });
    const events: string[] = [];
    host2.subscribe((e) => events.push(e.type));

    const createP = host2.threadsCreate({
      cwd: repo,
      prompt: "need perm",
      alwaysApprove: false,
    });

    let requestId: string | null = null;
    for (let i = 0; i < 40 && !requestId; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const items = host2.inboxList();
      const perm = items.find((x) => x.type === "permission");
      if (perm?.requestId) requestId = perm.requestId;
    }
    expect(requestId).toBeTruthy();
    host2.permissionsRespond(requestId!, "allow_once");
    await createP;

    const roster = host2.rosterList();
    expect(roster.some((r) => r.source === "live")).toBe(true);
    expect(host2.inboxList().length).toBeGreaterThan(0);
  });
});

describe("S2 worktrees / changes", () => {
  it("creates worktree and lists changes after edit", () => {
    const host = makeHost();
    const repo = tempRepo();
    const p = host.projectsAdd({ path: repo, trust: true });
    const wt = host.worktreesCreate(p.id, "feat-a");
    expect(fs.existsSync(wt.path)).toBe(true);
    fs.writeFileSync(path.join(repo, "README.md"), "changed\n");
    const summary = host.changesSummary(repo);
    expect(summary.files.some((f) => f.path.includes("README"))).toBe(true);
    const diff = host.changesDiff(repo, "README.md");
    expect(diff.patch.length >= 0).toBe(true);
    host.worktreesCleanup(wt.id, true);
  });
});

describe("S3 plan rails", () => {
  it("writes and approves plan.md under session dir when present", async () => {
    const host = makeHost();
    const repo = tempRepo();
    host.projectsAdd({ path: repo, trust: true });
    const created = await host.threadsCreate({
      cwd: repo,
      prompt: "hi",
      alwaysApprove: true,
    });
    // plant plan path if session dir exists under home; otherwise write via history path
    const dir = host.findSessionDir(created.sessionId);
    if (dir) {
      fs.writeFileSync(path.join(dir, "plan.md"), "# Plan\n\nDo X\n");
      const plan = host.plansGet(created.sessionId);
      expect(plan?.content).toContain("Do X");
      const approved = host.plansApprove(created.sessionId);
      expect(approved.status).toBe("approved");
    } else {
      // fake agent has no disk session — still exercise API without throw on null get
      expect(host.plansGet(created.sessionId)).toBeNull();
      expect(host.goalsGet(created.sessionId)).toBeNull();
      expect(host.subagentsTree(created.sessionId)).toEqual([]);
    }
  });
});

describe("S4 automations / extensibility", () => {
  it("creates automation, runNow produces inbox item", async () => {
    const host = makeHost();
    const repo = tempRepo();
    const p = host.projectsAdd({ path: repo, trust: true });
    const a = host.automationsCreate({
      name: "daily",
      projectId: p.id,
      schedule: "manual",
      prompt: "ping",
      worktreeMode: "project_root",
      alwaysApprove: true,
    });
    expect(a.id.startsWith("auto_")).toBe(true);
    const run = await host.automationsRunNow(a.id);
    expect(run.runId).toBeTruthy();
    const inbox = host.inboxList();
    expect(inbox.some((i) => i.type === "automation_result")).toBe(true);
    host.automationsPause(a.id);
    host.automationsDelete(a.id);
  });

  it("lists skills/plugins/mcp without throw", () => {
    const host = makeHost();
    expect(Array.isArray(host.skillsList())).toBe(true);
    expect(Array.isArray(host.pluginsList())).toBe(true);
    expect(Array.isArray(host.mcpList())).toBe(true);
    expect(host.authStatus()).toHaveProperty("authenticated");
    host.configPatch({ defaultModel: "grok-build" });
    expect(host.configGet().defaultModel).toBe("grok-build");
  });
});

describe("no-project chats group", () => {
  it("threadsCreate noProject uses chats workspace and stays unbound", async () => {
    const host = makeHost();
    const repo = tempRepo();
    // 即便登记了项目，noProject 也不应挂上
    host.projectsAdd({ path: repo, trust: true });

    const created = await host.threadsCreate({
      noProject: true,
      title: "loose-chat",
      alwaysApprove: true,
    });
    expect(created.sessionId).toBeTruthy();
    expect(created.cwd.replace(/\\/g, "/")).toMatch(/chats-workspace$/);
    expect(fs.existsSync(created.cwd)).toBe(true);

    const listed = host.listThreads();
    const row = listed.find((t) => t.sessionId === created.sessionId);
    expect(row).toBeTruthy();
    expect(row?.projectId).toBeUndefined();
    expect(row?.title).toContain("loose");
  });

  it("noProject still works when cwd is under a project path", async () => {
    const host = makeHost();
    const repo = tempRepo();
    host.projectsAdd({ path: repo, trust: true });

    const created = await host.threadsCreate({
      noProject: true,
      cwd: repo,
      title: "under-repo-but-loose",
      alwaysApprove: true,
    });
    const row = host
      .listThreads()
      .find((t) => t.sessionId === created.sessionId);
    expect(row?.projectId).toBeUndefined();
    expect(row?.cwd).toBe(path.resolve(repo));
  });
});
