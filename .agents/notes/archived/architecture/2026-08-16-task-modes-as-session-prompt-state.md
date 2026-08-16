# Agent Note: Task modes use session state and child-agent review

Status: implemented
Archived: 2026-08-16

English | [中文](2026-08-16-task-modes-as-session-prompt-state.zh.md)

## Problem

Task strategy had been combined with Agent preset presentation even though a prompt method and a preset control different runtime facts.

## Decision

`@graysilver/oh-my-dsh-task-modes-plugin` owns task-mode selection. `task-mode/selected` records the normal, first-principles, or adversarial-review strategy in the session log, and `task-mode:first-principles` reads that event history while assembling the calling agent's system prompt. The event makes later request headers reconstructable after resume and fork.

Adversarial-review mode listens at `agent/turn-stopping`. A parent turn containing a direct user task and a text assistant answer starts a fork child before `turn/end`, then records the outcome as `task-mode/review`. A fork seed ends at the last completed parent turn, so the child request also carries the current task and candidate answer. Its tool filter permits `read`, `glob`, `grep`, `read_image`, plus `bash` on macOS/Linux or `pwsh` on Windows for non-mutating inspection. The browser renders the durable report below the parent answer; it does not enter the parent model history or apply a revision automatically. A missing or failed child records an unavailable report without blocking the parent turn.

## Alternatives considered

- **Agent presets for task strategy**: presets select plugins, tools, and personas for a session. A task method must not alter that composition.
- **Browser-only selection**: the browser cannot supply durable model-visible state, so a reload or another client would reconstruct a different request.
- **A prompt-only review request**: asking the parent to criticize itself does not create an independent history or isolate reviewer actions.
- **Running the fork after `turn/end`**: that delays the report beyond the parent completion point and cannot present it as an outcome of the closing turn.

## Consequences

- Switching first-principles mode changes a later system prompt and therefore its request header; the log explains that change.
- Review consumes a separate model run for each eligible parent answer and is available only when the `fork` provider is composed.
- The reviewer has no automatic repair authority. The report is user-visible, remains outside later parent requests, and cannot block a parent answer when the child is unavailable.
