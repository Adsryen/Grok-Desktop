# agent-bin

本目录存放 **打进安装包 / 开发优先使用** 的 Grok agent 二进制。

| 文件 | 说明 |
|------|------|
| `grok.exe`（Windows）或 `grok`（macOS/Linux） | agent 可执行文件 |
| `VERSION.txt` | `npm run sync:agent` 自动生成（version / source / synced_at / sha256） |

## 放置方式

```bash
# 从本机 CLI 同步
npm run sync:agent

# 指定来源
npm run sync:agent -- --from /path/to/grok

# 从官方 CDN 拉取（CI / 指定平台）
npm run fetch:agent -- --platform windows --arch x86_64
npm run fetch:agent -- --platform macos --arch aarch64
```

只复制 **程序文件**，不要复制 `~/.grok` / `~/.grok-desktop` 配置或会话目录。  
**按平台分别准备**：Win 包需要 `grok.exe`，Mac 包需要 `grok`（darwin），不要混用。

## Git

默认 **不入库**（体积大）。目录占位用 `.gitkeep`。  
发版机 / CI 保留对应平台二进制与 `VERSION.txt` 后再 `dist:win` / `dist:mac`。

## 运行时

- 开发：`agent-bin/grok.exe`（或 `grok`）
- 安装包：`resources/agent/grok[.exe]`（由 electron-builder 从本目录打包，含 VERSION.txt）

设置 → 关于 会展示路径、`grok --version` 与 VERSION 元数据。
