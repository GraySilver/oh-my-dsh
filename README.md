# Oh My DSH

English | [中文](README.zh.md)

Oh My DSH is a ready-to-use, Web-only product built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It keeps the upstream agent runtime and plugin ecosystem, then adds an opinionated local launcher, first-run setup, task modes, and product release lifecycle.

This is an independent fork. It is not part of JarvisBot and shares no runtime, configuration, or release path with that project.

## Start

Node.js 22.19+ or 24+ is required.

```sh
npx @graysilver/oh-my-dsh
```

The command starts the local Web application, opens the browser, and hands the invoking directory to the workspace screen. Product data lives under `~/.oh-my-dsh`; set `OH_MY_DSH_HOME` to choose another location.

The first run has two short steps:

1. Acknowledge the local-data and permission boundary.
2. Enter a DeepSeek API key. The key is tested against model discovery before it is persisted to the local credentials file.

Telemetry is disabled in the product composition and in the launcher environment. Agent file and command operations still follow the permission and confirmation semantics supplied by DeepSeek Harness.

To make the UI reachable from your local network, opt in explicitly:

```sh
npx @graysilver/oh-my-dsh --host 0.0.0.0
```

This gives every device that can reach the port the same Oh My DSH permissions as localhost, including provider settings, credentials, model discovery, local file access, and approved command execution. There is no login boundary in this mode: use it only on a trusted network, and stop the process when the remote session is finished. Loopback remains the default.

## Three task modes

- **Quick** sends the task directly to the current session.
- **Plan first** enters the upstream `/plan` mode, then sends the task so the plan remains reviewable before implementation.
- **Autonomous** creates a persistent upstream `/goal`; the goal driver owns continued rounds and stops on completion or a genuine blocker.

These are product affordances over upstream capabilities, not separate agent engines. Sessions, tools, permissions, goals, plans, and future compatible features continue to come from DeepSeek Harness.

## Public command surface

```text
oh-my-dsh
oh-my-dsh --host 0.0.0.0
oh-my-dsh doctor [--json] [--model]
oh-my-dsh --help
oh-my-dsh --version
```

There are intentionally no public profile, headless, plugin-management, or raw Harness commands. Non-Web upstream source remains in the repository only so this fork can merge and validate upstream changes; it is not an Oh My DSH product interface.

`doctor` checks the supported Node version, product/upstream version lock, product patch, data and workspace permissions, local port 3080, and credential presence. `--model` also tests the live model-discovery route. `--json` emits a versioned schema and never includes the credential value.

## Upstream and releases

The repository keeps two remotes:

```text
origin    git@github.com:GraySilver/oh-my-dsh.git
upstream  https://github.com/deepseek-ai/deepseek-harness.git
```

A scheduled workflow merges `upstream/master` into one reviewable draft PR, records the exact upstream commit, and aligns the wrapper with the latest official `@deepseek-ai/dsh` npm version. It never publishes. Product releases use the independent `oh-my-dsh-v*` tag family, build three `@graysilver` tarballs, verify them in a clean consumer, and publish those exact bytes only after the protected npm environment approves them.

This split is deliberate: an upstream commit can exist before a corresponding official npm artifact. The source merge proves compatibility; the pinned npm version identifies the engine users actually run.

## Develop from source

```sh
git clone git@github.com:GraySilver/oh-my-dsh.git
cd oh-my-dsh
pnpm install
pnpm run build
pnpm oh-my-dsh
```

Focused verification for the product layer:

```sh
pnpm run typecheck
pnpm run lint
pnpm exec vitest run apps/oh-my-dsh/tests \
  packages/client/ui-agent-preset/tests \
  packages/client/ui-settings-models/tests
pnpm run release:pack --family oh-my-dsh --out dist/npm-oh-my-dsh
pnpm run release:verify-packed-install --family oh-my-dsh \
  --from dist/npm-oh-my-dsh
```

The inherited architecture and contributor constraints remain documented in [AGENTS.md](AGENTS.md), [the development guide](docs/development.md), and [the architecture guide](docs/architecture.md).

## License and attribution

[MIT](LICENSE). DeepSeek Harness is developed by DeepSeek AI and remains the upstream runtime. Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
