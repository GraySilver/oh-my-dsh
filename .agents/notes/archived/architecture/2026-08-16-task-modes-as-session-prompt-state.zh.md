# Agent Note: 任务模式使用 session 状态和子 Agent 审查

Status: implemented
Archived: 2026-08-16

[English](2026-08-16-task-modes-as-session-prompt-state.md) | 中文

## Problem

任务策略曾与 Agent preset 展示混在一起，但提示词方法和 preset 控制的是不同的运行时事实。

## Decision

`@graysilver/oh-my-dsh-task-modes-plugin` 持有任务模式选择。`task-mode/selected` 在 session log 中记录普通、第一性原理或对抗式审查策略，`task-mode:first-principles` 在组装调用 agent 的 system prompt 时读取这些事件。该事件使恢复和 fork 后的后续 request header 可以重建。

对抗式审查模式监听 `agent/turn-stopping`。包含直接用户任务和文本 assistant 答复的父级 turn 会在 `turn/end` 前启动 fork child，随后将结果记录为 `task-mode/review`。fork seed 在最后一个完成的父级 turn 结束，因此 child 请求还携带当前任务和候选答复。tool filter 允许 `read`、`glob`、`grep`、`read_image`，以及用于非修改性检查的 shell：macOS/Linux 使用 `bash`，Windows 使用 `pwsh`。浏览器在父级答复下方渲染持久化报告；它不会进入父级模型历史，也不会自动应用修订。child 缺失或失败时会记录不可用报告，且不会阻断父级 turn。

## Alternatives considered

- **用 Agent preset 表示任务策略**：preset 选择 session 的插件、工具和 persona。任务方法不应改变该组装。
- **仅在浏览器保存选择**：浏览器不能提供持久的模型可见状态，重新加载或其他客户端会重建不同请求。
- **让父 Agent 自我审查**：让父 Agent 批评自己不会形成独立历史，也不能隔离 reviewer 操作。
- **在 `turn/end` 后运行 fork**：这会让报告迟于父级完成点，无法作为关闭 turn 的结果显示。

## Consequences

- 切换第一性原理模式会改变后续 system prompt 和 request header；日志解释该变更。
- 审查会为每个符合条件的父级答复消耗独立模型运行，且仅在已组装 `fork` provider 时可用。
- reviewer 没有自动修复权限。报告对用户可见，不会进入后续父级 request，child 不可用时也不能阻断父级答复。
