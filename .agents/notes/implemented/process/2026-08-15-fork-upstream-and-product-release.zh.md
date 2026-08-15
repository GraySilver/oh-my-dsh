# Agent Note: 经审阅的上游同步与产品发布

Status: implemented

[English](2026-08-15-fork-upstream-and-product-release.md) | 中文

## 问题

增强 fork 需要持续消费上游变更，但定时合并不能直接发布未经审阅的产品字节。源码提交与官方 npm 产物的推进时钟也不同：合并一条提交，不代表包含它的可安装上游引擎已经存在。既有 dsh 发布族也不能持有独立版本的 `@graysilver` 包。

## 决策

`origin` 指向 `GraySilver/oh-my-dsh`，`upstream` 指向 `deepseek-ai/deepseek-harness`。`.github/workflows/upstream-sync.yml` 每周及按需运行。它把 `upstream/master` 合并到稳定的 `automation/upstream-sync` 分支，记录上游提交，让两个官方运行时依赖对齐当前 npm 版本，更新 lockfile，推送分支，并创建或更新一条 Draft PR。兼容检查在 Draft PR 已经存在后运行，因此失败仍然可见、可审阅。该 workflow 绝不发布，也绝不直接推送 `main`。

既有发布框架增加 `oh-my-dsh` 族。它的精确成员是包装器和两个产品浏览器包；三者共享同一个产品版本，但不修改上游 workspace 根版本。该族使用 `oh-my-dsh-v<version>`，套用普通的无源码 tarball 策略，按运行时依赖让浏览器包先于包装器发布，并用普通 Node 验证安装后的包装器。

`.github/workflows/release-oh-my-dsh.yml` 在没有 registry 凭据的情况下构建和打包。产品 tag 或明确发布 dispatch 会把同一份 artifact 送入受保护的 `npm-publish` environment。Publish job 不会重新构建。Registry integrity 比对沿用发布框架既有规则，让同一 artifact 可以幂等重试。

## 曾考虑的替代方案

**每次上游合并成功后自动发布。** 不采用：上游源码兼容、官方 npm 是否可用和产品 UX 兼容是三件不同的事实。产品版本与 tag 之前仍保留人工审阅边界。

**让产品包加入 dsh 发布族。** 不采用：这会强迫 fork 产品版本等于每一个上游包和 workspace 根版本，而且一次上游发布会隐式重发产品。

**挑选上游提交复制，而不是合并上游分支。** 不采用：cherry-pick 会把 fork 变成一列未记录的补丁队列，遗漏很难与有意产品改动区分。

**直接从源码 checkout 发布。** 不采用：重新构建的发布内容可能不同于通过打包后安装验证的 artifact。Artifact 才是发布边界。

## 后果

每次采用上游都会有一条可见的兼容 PR、精确源码提交、精确官方引擎包和检查结果。产品发布保持独立且经过审阅。强制更新一条自动化分支让 PR 数量有界，代价是审阅者比较连续同步尝试时需要使用 PR 历史或上游提交字段。

合并冲突会在分支更新前终止 workflow；它们需要手工兼容分支，因为提交未解决冲突标记会制造一条误导性的 Draft PR。缺少 GitHub 或 npm 权限也会明确失败，不会静默跳过同步或发布。
