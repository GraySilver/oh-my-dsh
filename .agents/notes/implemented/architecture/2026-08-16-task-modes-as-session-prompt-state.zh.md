# Agent Note: 任务模式使用 session 状态和子 Agent 审查

Status: implemented

[English](2026-08-16-task-modes-as-session-prompt-state.md) | 中文

## Problem

任务策略曾与 Agent preset 展示混在一起，但提示词方法和 preset 控制的是不同的运行时事实。

## Decision

`@graysilver/oh-my-dsh-task-modes-plugin` 持有任务模式选择。`task-mode/selected` 在 session log 中记录普通或第一性原理策略，`task-mode:first-principles` 在组装调用 agent 的 system prompt 时读取这些事件。该事件使恢复和 fork 后的后续 request header 可以重建。

对抗式审查通过已有 `fork` subagent provider 创建 fork child。其请求要求审查父级历史，tool filter 拒绝变更和 shell 工具。命令返回 child 结果；它不会修改父 session，也不会自动应用修订。

## Alternatives considered

- **用 Agent preset 表示任务策略**：preset 选择 session 的插件、工具和 persona。任务方法不应改变该组装。
- **仅在浏览器保存选择**：浏览器不能提供持久的模型可见状态，重新加载或其他客户端会重建不同请求。
- **让父 Agent 自我审查**：让父 Agent 批评自己不会形成独立历史，也不能隔离 reviewer 操作。

## Consequences

- 切换第一性原理模式会改变后续 system prompt 和 request header；日志解释该变更。
- 审查会消耗独立模型运行，且仅在已组装 `fork` provider 时可用。
- reviewer 没有自动修复权限。用户或父 Agent 决定是否依据报告采取行动。
