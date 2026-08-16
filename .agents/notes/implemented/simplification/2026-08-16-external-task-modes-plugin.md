# Agent Note: Task modes distribute as an external bundle

Status: implemented

English | [中文](2026-08-16-external-task-modes-plugin.zh.md)

## Problem

The product composition carried task-mode behavior, session events, and browser controls that other DSH products could not install independently.

## Decision

This repository does not compose a task-mode plugin or define `task-mode/*` session events. Task modes distribute only through the external `@graysilver/dsh-task-modes` bundle, whose package owns its configuration, persisted records, and Web controls.

## Alternatives considered

- **Keep the product plugin beside the external bundle**: two implementations would diverge in prompts, review timing, and persisted state.
- **Retain core event recognition for old sessions**: pre-release session persistence intentionally rejects removed required event types instead of preserving retired behavior.

## Consequences

- Oh My DSH users install the external bundle when they need task modes.
- Existing session logs containing retired `task-mode/*` events are unsupported.
