# Agent Note: Task modes use session state and child-agent review

Status: implemented

English | [中文](2026-08-16-task-modes-as-session-prompt-state.zh.md)

## Problem

Task strategy had been combined with Agent preset presentation even though a prompt method and a preset control different runtime facts.

## Decision

`@graysilver/oh-my-dsh-task-modes-plugin` owns task-mode selection. `task-mode/selected` records the normal or first-principles strategy in the session log, and `task-mode:first-principles` reads that event history while assembling the calling agent's system prompt. The event makes later request headers reconstructable after resume and fork.

Adversarial review starts a fork child through the existing `fork` subagent provider. Its request requires a review of the parent history, and its tool filter denies mutation and shell tools. The child result is returned by the command; it does not modify the parent session or apply a revision automatically.

## Alternatives considered

- **Agent presets for task strategy**: presets select plugins, tools, and personas for a session. A task method must not alter that composition.
- **Browser-only selection**: the browser cannot supply durable model-visible state, so a reload or another client would reconstruct a different request.
- **A prompt-only review request**: asking the parent to criticize itself does not create an independent history or isolate reviewer actions.

## Consequences

- Switching first-principles mode changes a later system prompt and therefore its request header; the log explains that change.
- Review consumes a separate model run and is available only when the `fork` provider is composed.
- The reviewer has no automatic repair authority. A user or the parent agent decides whether to act on its report.
