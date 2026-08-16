# @graysilver/oh-my-dsh-task-modes-plugin

[English](README.md) | 中文

独立的 Cordis 任务模式插件。浏览器选择器占用 `conversation.input.left`；`normal` 与 `first-principles` 执行 `/task-mode`，对抗式审查执行 `/adversarial-review`。

Host 将 `task-mode/selected` 记录到 session log。第一性原理模式向调用 agent 的 system prompt 贡献 `task-mode:first-principles`。对抗式审查要求存在 `fork` subagent provider，以父级历史启动 child，并拒绝变更和 shell 工具。命令返回 child 结果，绝不自动改变父 session。

## Model Experience

### 第一性原理 system prompt

#### What the model sees

第一性原理模式增加一个 system-prompt 段，要求列出目标、事实、约束、假设、推导和验证。选择被持久化，因此后续 request header 可以重建相同段。对抗式审查向 fork child 发送对已完成父级历史的审查请求，child 不会得到自动修复指令。

##### 第一性原理指引

```markdown
For this task, reason from first principles. State the objective and success criteria, separate verified facts from assumptions, identify hard constraints, derive the solution from those facts, and describe how you will verify the result.
```

#### Token effect

第一性原理模式在之后每个父级 request 中增加固定 prompt token。审查消耗独立的 child-agent request。

#### KV Cache effect

选择或清除第一性原理模式会改变父级 system-prompt 前缀。模式不变时前缀保持不变。

## Known Limitations and Deferred Work

- 审查仅在已组装 `fork` subagent provider 的部署中可用。
- reviewer 输出返回到 command result；用户决定是否请求修订。
