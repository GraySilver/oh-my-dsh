# @graysilver/oh-my-dsh-task-modes-plugin

English | [中文](README.zh.md)

Independent Cordis task-mode plugin. The browser selector occupies `conversation.input.left`; `normal` and `first-principles` execute `/task-mode`, while adversarial review executes `/adversarial-review`.

The host records `task-mode/selected` in the session log. First-principles mode contributes `task-mode:first-principles` to the calling agent's system prompt. Adversarial review requires the `fork` subagent provider, starts a child over the parent history, and denies mutation and shell tools. The child result is returned by the command; it never changes the parent session automatically.

## Model Experience

### First-principles system prompt

#### What the model sees

First-principles mode adds a system-prompt section requiring objective, facts, constraints, assumptions, derivation, and verification. The selection is durable, so later request headers reconstruct the same section. Adversarial review sends the forked child a review request over completed parent history; the child receives no automatic repair instruction.

##### First-principles guidance

```markdown
For this task, reason from first principles. State the objective and success criteria, separate verified facts from assumptions, identify hard constraints, derive the solution from those facts, and describe how you will verify the result.
```

#### Token effect

First-principles mode adds fixed prompt tokens to each later parent request. Review consumes a separate child-agent request.

#### KV Cache effect

Selecting or clearing first-principles mode changes the parent system-prompt prefix. Unchanged mode preserves that prefix.

## Known Limitations and Deferred Work

- Review is available only where a `fork` subagent provider is composed.
- Reviewer output is returned to the command result; users decide whether to request a repair.
