/**
 * 从官方 CDN 下载预编译 grok 到 agent-bin/（CI / 无本机 CLI 时用）。
 *
 *   npm run fetch:agent
 *   npm run fetch:agent -- --platform macos --arch aarch64
 *   npm run fetch:agent -- --version 0.2.106
 *   npm run fetch:agent -- --channel stable
 *
 * 官方渠道：https://x.ai/cli （回退 GCS public artifacts）
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const destDir = path.join(appRoot, "agent-bin");
const versionPath = path.join(destDir, "VERSION.txt");

const BASE_PRIMARY = "https://x.ai/cli";
const BASE_FALLBACK =
  "https://storage.googleapis.com/grok-build-public-artifacts/cli";

/** 低于此大小视为下载失败/损坏 */
const MIN_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const out = {
    platform: null,
    arch: null,
    version: null,
    channel: "stable",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--platform" && argv[i + 1]) out.platform = argv[++i];
    else if (a === "--arch" && argv[i + 1]) out.arch = argv[++i];
    else if (a === "--version" && argv[i + 1]) out.version = argv[++i];
    else if (a === "--channel" && argv[i + 1]) out.channel = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/fetch-agent-bin.mjs [options]
  --platform  windows|macos|linux   (default: current OS)
  --arch      aarch64|x86_64|arm64|x64  (default: current arch; macos default aarch64)
  --version   X.Y.Z                 (default: channel pointer)
  --channel   stable|alpha|...      (default: stable)`);
      process.exit(0);
    }
  }
  return out;
}

function normalizePlatform(p) {
  const x = (p ?? process.platform).toLowerCase();
  if (x === "win32" || x === "windows" || x === "win") return "windows";
  if (x === "darwin" || x === "macos" || x === "mac") return "macos";
  if (x === "linux") return "linux";
  throw new Error(`Unsupported platform: ${p ?? process.platform}`);
}

function normalizeArch(a, platform) {
  const raw = a ?? process.arch;
  const x = String(raw).toLowerCase();
  if (x === "arm64" || x === "aarch64") return "aarch64";
  if (x === "x64" || x === "x86_64" || x === "amd64") return "x86_64";
  if (!a && platform === "macos") return "aarch64";
  if (!a) return process.arch === "arm64" ? "aarch64" : "x86_64";
  throw new Error(`Unsupported arch: ${a}`);
}

function binName(platform) {
  return platform === "windows" ? "grok.exe" : "grok";
}

function artifactFileName(version, platform, arch) {
  const base = `grok-${version}-${platform}-${arch}`;
  return platform === "windows" ? `${base}.exe` : base;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return (await r.text()).trim();
}

async function resolveVersion(channel, explicit) {
  if (explicit && String(explicit).trim()) {
    const v = String(explicit).trim();
    if (!/^\d+\.\d+\.\d+(-[A-Za-z0-9._]+)?$/.test(v)) {
      throw new Error(`Invalid version: ${v}`);
    }
    return v;
  }
  const ch = channel || "stable";
  try {
    const text = await fetchText(`${BASE_PRIMARY}/${ch}`);
    const line = text.split(/\r?\n/).find((l) => l.trim())?.trim();
    if (line && /^\d+\.\d+\.\d+/.test(line)) return line;
  } catch {
    /* fallback */
  }
  const text = await fetchText(`${BASE_FALLBACK}/${ch}`);
  const line = text.split(/\r?\n/).find((l) => l.trim())?.trim();
  if (!line || !/^\d+\.\d+\.\d+/.test(line)) {
    throw new Error(`Failed to resolve agent version from channel ${ch}`);
  }
  return line;
}

async function downloadBinary(relName, dest) {
  const urls = [
    `${BASE_PRIMARY}/${relName}`,
    `${BASE_FALLBACK}/${relName}`,
  ];
  let lastErr;
  for (const url of urls) {
    try {
      console.log(`[fetch-agent-bin] GET ${url}`);
      const r = await fetch(url);
      if (!r.ok) {
        lastErr = new Error(`GET ${url} → ${r.status}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < MIN_BYTES) {
        lastErr = new Error(
          `Downloaded ${url} too small (${buf.length} bytes)`,
        );
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return { url, size: buf.length };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("download failed");
}

function writeVersionFile({ source, version, sha256, binary }) {
  const lines = [
    `version=${version ?? ""}`,
    `source=${source}`,
    `synced_at=${new Date().toISOString()}`,
    `sha256=${sha256}`,
    `binary=${binary}`,
    "",
  ];
  fs.writeFileSync(versionPath, lines.join("\n"), "utf8");
}

const args = parseArgs(process.argv.slice(2));
const platform = normalizePlatform(args.platform);
const arch = normalizeArch(args.arch, platform);
const binary = binName(platform);
const dest = path.join(destDir, binary);

const version = await resolveVersion(args.channel, args.version);
const relName = artifactFileName(version, platform, arch);

console.log(
  `[fetch-agent-bin] platform=${platform} arch=${arch} version=${version}`,
);
console.log(`[fetch-agent-bin] → ${path.relative(appRoot, dest)}`);

const { url, size } = await downloadBinary(relName, dest);

if (platform !== "windows") {
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* ignore */
  }
}

const sha256 = sha256File(dest);
writeVersionFile({ source: url, version, sha256, binary });

console.log(
  `[fetch-agent-bin] OK size=${(size / (1024 * 1024)).toFixed(1)} MB`,
);
console.log(`[fetch-agent-bin] version=${version}`);
console.log(`[fetch-agent-bin] sha256=${sha256.slice(0, 16)}…`);
console.log(`[fetch-agent-bin] 已写 ${versionPath}`);
