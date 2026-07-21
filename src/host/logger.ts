import fs from "node:fs";
import path from "node:path";
import { desktopLogsDir, ensureDesktopDirs } from "./paths.js";

export class HostLogger {
  private stream: fs.WriteStream | null = null;
  private readonly filePath: string;

  constructor(home?: string) {
    ensureDesktopDirs(home);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.filePath = path.join(desktopLogsDir(home), `host-${stamp}.log`);
  }

  get path(): string {
    return this.filePath;
  }

  private ensureStream(): fs.WriteStream | null {
    if (this.stream) return this.stream;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const s = fs.createWriteStream(this.filePath, { flags: "a" });
      // 测试 rm 掉 home 后异步 error 勿变成 uncaught
      s.on("error", () => {
        try {
          s.destroy();
        } catch {
          /* ignore */
        }
        if (this.stream === s) this.stream = null;
      });
      this.stream = s;
      return s;
    } catch {
      return null;
    }
  }

  log(level: "info" | "warn" | "error" | "debug", message: string, extra?: unknown): void {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      extra: extra === undefined ? undefined : extra,
    });
    try {
      this.ensureStream()?.write(line + "\n");
    } catch {
      // ignore disk errors in logger
    }
    if (level === "error") {
      console.error(`[host] ${message}`, extra ?? "");
    }
  }

  info(message: string, extra?: unknown): void {
    this.log("info", message, extra);
  }

  warn(message: string, extra?: unknown): void {
    this.log("warn", message, extra);
  }

  error(message: string, extra?: unknown): void {
    this.log("error", message, extra);
  }

  debug(message: string, extra?: unknown): void {
    this.log("debug", message, extra);
  }

  close(): void {
    this.stream?.end();
    this.stream = null;
  }
}
