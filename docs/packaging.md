# Grok Desktop 打包与 agent-bin

目标：安装包可自带 agent；开发时使用项目内 `agent-bin/`，**不必每次从本机复制**（更新 agent 时再覆盖或 `npm run sync:agent`）。

## 目录

| 路径 | 用途 |
|------|------|
| `agent-bin/grok.exe`（或 `grok`） | 开发与打包的权威二进制 |
| `agent-bin/VERSION.txt` | `sync:agent` 写入：version / source / synced_at / sha256 |
| 安装后 `resources/agent/` | 用户机器上的内置 agent + VERSION.txt |
| `~/.grok-desktop` | 用户数据（登录/会话），**不打包** |

## 解析顺序

与 `src/host/resolve-grok.ts` 一致：

1. 设置 / `GROK_DESKTOP_AGENT`（override）
2. **agent-bin**（开发）或 **resources/agent**（安装包，bundled）
3. PATH / `~/.grok/bin` / `~/.grok-desktop/bin`

## 准备二进制

```bash
# 从本机 CLI 同步（开发机已安装 grok 时）
npm run sync:agent

# 或指定路径
npm run sync:agent -- --from /path/to/grok

# 或从官方 CDN 拉取（CI / 无本机 CLI；可指定平台）
npm run fetch:agent
npm run fetch:agent -- --platform macos --arch aarch64
npm run fetch:agent -- --platform windows --arch x86_64 --version 0.2.106
```

官方预编译：`https://x.ai/cli`（`stable` 指针 + `grok-{ver}-{os}-{arch}`）。  
二进制与 `VERSION.txt` **默认不入库**（gitignore）；发版机 / CI 现拉即可。

## 开发 / 打包

```bash
# 确认 agent-bin 下已有**当前平台**二进制
npm run check:agent
npm start

npm run dist:win   # Windows：本机；NSIS + latest.yml
npm run dist:mac   # 仅在 macOS 上：arm64 dmg + zip；未签名
```

`pack` / `dist` / `dist:win` / `dist:mac` 在缺少有效二进制时会 **失败退出**，避免空 agent 安装包。

校验：设置 → 关于 → 来源应为 `bundled（agent-bin / 安装包）`；若有 `VERSION.txt` 会显示记录版本、同步时间、sha256 前缀。

## macOS（无本机 Mac：GitHub Actions）

| 项 | 约定 |
|----|------|
| 正式渠道 | `.github/workflows/release-mac.yml`（`macos-latest`） |
| 架构 | **arm64 only**（Apple Silicon） |
| 产物 | `GrokDesktop-{ver}-mac-arm64.dmg` + `.zip` + `latest-mac.yml` |
| agent | CI 内 `npm run fetch:agent -- --platform macos --arch aarch64` |
| 签名 | **首版不签名**（`CSC_IDENTITY_AUTO_DISCOVERY=false` / `identity: null`） |
| 触发 | `workflow_dispatch` 或 push tag `v*` |

手动试跑（仓库 Actions 页）：

1. 选 **release-mac** → Run workflow  
2. 默认只构建并上传 **workflow artifact**（不写 Release）  
3. 勾选 **upload_release** 时写入 GitHub Release（tag 为当前 `package.json` 的 `v{version}`，或 push 的 tag）

未签名安装：用户在 Finder 中 **右键 App → 打开** 一次即可。

## 发版建议

1. Win：本机 `sync:agent` / `fetch:agent` 后 `npm run dist:win`  
2. Mac：Actions `release-mac`（或 tag 触发）  
3. 同一 GitHub Release 挂齐 Win exe + Mac dmg/zip；上传 `latest.yml` 与 `latest-mac.yml`  
4. Release 说明写清 Desktop version 与内置 agent version / sha256  

## 相关代码

- `src/host/agent-bin.ts` — 路径候选
- `src/host/resolve-grok.ts` — 解析顺序与 VERSION 元数据
- `scripts/sync-agent-bin.mjs` — 本机同步 + VERSION.txt
- `scripts/fetch-agent-bin.mjs` — 官方 CDN 拉取
- `scripts/check-agent-bin.mjs` — 打包前检查
- `package.json` → `build.extraResources` / `build.mac`
- `.github/workflows/release-mac.yml`
