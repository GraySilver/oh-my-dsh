# Agent Note: 任务模式作为外部 bundle 分发

Status: implemented

[English](2026-08-16-external-task-modes-plugin.md) | 中文

## Problem

产品组装同时携带任务模式行为、session event 和浏览器控件，其他 DSH 产品无法独立安装这些能力。

## Decision

本仓库不再组装任务模式 plugin，也不再定义 `task-mode/*` session event。任务模式只通过外部 `@graysilver/dsh-task-modes` bundle 分发，由该 package 持有配置、持久化记录和 Web 控件。

## Alternatives considered

- **让产品 plugin 与外部 bundle 并存**：两套实现会在提示词、审查时机和持久化状态上逐渐分叉。
- **为旧 session 保留 core event 识别**：预发布 session 持久化会拒绝已移除的必需 event，而不是保留已退役的行为。

## Consequences

- Oh My DSH 用户需要任务模式时安装外部 bundle。
- 含有已退役 `task-mode/*` event 的既有 session log 不受支持。
