# Agent Note: Oh My DSH 的 Electron Desktop 托管

Status: implemented

[English](2026-08-15-oh-my-dsh-macos-desktop.md) | 中文

## Problem

产品 Web 启动器会打开外部浏览器，Gateway 生命周期由 CLI 进程负责。macOS 产品需要一个面向用户的 Desktop 入口，在自己的窗口内承载 WebUI、统一管理本地 runtime，并在隐藏窗口后继续驻留菜单栏，同时保留现有 CLI 诊断路径。

## Decision

Oh My DSH 新增独立的 `apps/oh-my-dsh-desktop` Electron workspace。Electron 主进程启动监听 `0.0.0.0:3080` 的共享产品 Web 运行时，在一个 BrowserWindow 内加载 loopback ready URL，直到应用退出都拥有该子进程，并只通过类型化 preload 操作向页面暴露能力。窗口关闭后隐藏到菜单栏，`Cmd+Shift+Space` 显示窗口，原生通知复用现有 mux/host SSE 流并提供重连与去重。Desktop 检测固定端口占用并报告错误，同时明确 LAN 暴露和与 localhost 相同的权限。退出时会取消尚未完成的启动、关闭通知流、终止运行时，并等待它真正退出后再结束 Electron。

这里的托管模型是 Desktop-owned process tree，而不是单个操作系统 PID：Electron 主进程与上游运行时保持独立进程，便于显式停止并等待生命周期结束。现有 `oh-my-dsh` CLI 继续打开系统浏览器，作为开发和诊断入口。

## Alternatives considered

**合并为单个 PID：**不采用。上游 Web profile 是独立发布的 Node runtime，Electron Node 模式是支持的进程边界；强行合并会重复启动假设，也会让退出闭环更难观察。

**单独再写一套 Desktop 启动器：**不采用。CLI 与 Desktop 会在 patch 选择、ready 检测、环境设置和退出处理上逐渐分叉；两者现在共用 `startWebRuntime`。

**自动替换或分配端口：**不采用。`0.0.0.0` 提供完整本地权限，隐式替换可能终止无关的用户会话；Desktop 检查固定端口并直接失败。

## Verification

聚焦启动器测试约束 ready 行解析、取消以及 ready 前退出时的近期输出诊断。打包命令构建两种 macOS 架构，在各自应用目录树内补全上游对等依赖（peer dependency）图，合并 Universal 应用，使用隔离的产品 home 启动完整 Web profile，获取 WebUI 入口，然后停止运行时并等待其退出。

## Consequences

Desktop workspace 新增 Electron 和 Electron Builder 工具，并在独立于 `dist/` 主进程与 preload bundle 的 `release/` 目录中产出 Universal macOS `.app/.dmg`。由于 profile 位于 Electron 虚拟文件系统之外，并通过普通 Node ESM 查找解析安装 fallback，应用文件会保留在物理 `Resources/app` 目录中，而不放入 ASAR 归档。打包前会根据当前产品依赖图生成对等依赖暂存目录，安装 Electron Builder 遗漏的全部非可选对等依赖根；每个架构的打包钩子只把目标中缺失且与架构无关的包补入同一棵物理 `node_modules`，并拒绝加入原生模块。这样可以自动跟随上游新增插件和 Service Definition 对等依赖，无需维护手写包清单。打包后冒烟测试使用隔离的产品 home 启动完整 Web profile，再停止并等待其退出。Universal 组装会保留两套按架构命名的 macOS 原生依赖，只允许位于明确 `darwin-arm64` 或 `darwin-x64` 路径下的相同 Mach-O 文件跳过合并。LAN 访问保持刻意的无认证设计，只能在可信网络使用。macOS 禁止通知权限时，原生通知属于尽力而为，WebUI 和 Tray 仍是任务状态的真源。
