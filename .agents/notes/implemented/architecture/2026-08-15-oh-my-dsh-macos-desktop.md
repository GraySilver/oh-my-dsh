# Agent Note: Electron Desktop ownership for Oh My DSH

Status: implemented

English | [中文](2026-08-15-oh-my-dsh-macos-desktop.zh.md)

## Problem

The product Web launcher opened an external browser and kept the gateway lifecycle in the CLI process. A macOS product needs one user-facing Desktop entry that owns the local runtime, keeps the WebUI inside its window, and remains available from the menu bar without weakening the existing CLI diagnostic path.

## Decision

Oh My DSH ships an independent `apps/oh-my-dsh-desktop` Electron workspace. Electron main starts the shared product Web runtime with `0.0.0.0:3080`, loads the loopback ready URL in one BrowserWindow, owns the child until application exit, and exposes only typed preload operations. The window closes to the menu bar, `Cmd+Shift+Space` shows it, and native notifications consume the existing mux/host SSE streams with reconnect and deduplication. The Desktop refuses an occupied product port and reports LAN exposure with localhost-equivalent permissions. Quit cancels an in-progress startup, closes notification streams, terminates the runtime, and waits for its exit before Electron exits.

The ownership model is a Desktop-owned process tree, not a single operating-system PID: Electron main and the upstream runtime remain separate processes so the upstream lifecycle can be stopped and awaited explicitly. The existing `oh-my-dsh` CLI continues to open the system browser and remains the development/diagnostic entry.

## Alternatives considered

**Single PID embedding:** rejected because the upstream Web profile is an independently published Node runtime and Electron's Node mode is the supported process boundary; forcing all code into one PID would duplicate boot assumptions and make teardown less observable.

**A second Desktop-specific launcher:** rejected because CLI and Desktop would drift on patch selection, ready detection, environment setup, and shutdown. Both now call the shared `startWebRuntime` implementation.

**Automatic port replacement or allocation:** rejected because `0.0.0.0` grants full local permissions and an implicit replacement could terminate an unrelated user session. Desktop checks the fixed port and fails loudly.

## Verification

Focused launcher tests pin ready-line parsing, cancellation, and recent-output diagnostics for pre-ready exits. The package command builds both macOS architectures, completes the upstream peer dependency graph inside each application tree, merges a Universal application, starts its complete Web profile with an isolated product home, fetches the WebUI entry, then stops and awaits the runtime.

## Consequences

The Desktop package adds Electron and Electron Builder as workspace tooling and produces the `OhMyDSH` Universal macOS `.app/.dmg` artifacts under its `release/` directory, separate from the bundled main/preload code in `dist/`. Its icon is generated from the official DeepSeek whale mark served at `https://www.deepseek.com/favicon.ico` and flattened onto an opaque white canvas. Application files remain in a physical `Resources/app` directory instead of an ASAR archive because profiles live outside Electron's virtual filesystem and resolve their installation fallback through ordinary Node ESM lookup. Before packaging, a generated peer stage reads the current product dependency graph and installs every non-optional peer root omitted by Electron Builder; the per-architecture packaging hook copies only missing architecture-neutral packages into the same physical `node_modules` and rejects native additions. This follows new upstream plugins and Service Definition peers without a hand-maintained package list. The post-package smoke boots the complete Web profile with an isolated product home before stopping and awaiting it. Universal assembly retains both architecture-named macOS native dependency sets and allows identical Mach-O files only below explicit `darwin-arm64` or `darwin-x64` paths. LAN access remains intentionally unauthenticated and must be treated as trusted-network-only. Native notification delivery is best-effort when macOS notification permission is unavailable; the WebUI and Tray remain authoritative for task state.
