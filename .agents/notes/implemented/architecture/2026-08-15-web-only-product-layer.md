# Agent Note: Web-only product layer over the upstream Harness

Status: implemented

English | [中文](2026-08-15-web-only-product-layer.zh.md)

## Problem

DeepSeek Harness exposes a composable runtime and several operator-facing CLI surfaces. A consumer product needs a narrower promise: install one package, open a local browser workspace, connect DeepSeek safely, and choose how much planning or autonomy a task receives. Copying the runtime into a second engine would make every upstream improvement a manual port, while exposing the raw Harness CLI would make the product boundary indistinguishable from upstream.

The invoking project directory also needs to reach the browser without adding a new Host API or a second workspace registry. First-run credential setup must not persist an untested key, and product privacy defaults must not depend on a user remembering an environment flag.

## Decision

`@graysilver/oh-my-dsh` is a thin executable over the exact official `@deepseek-ai/dsh` version recorded in its manifest. With no arguments it spawns the upstream `web` profile with `config/oh-my-dsh.patch.yml`, uses the independent `OH_MY_DSH_HOME` root (default `~/.oh-my-dsh`), waits for the upstream readiness URL, and opens that URL in the default browser. The product patch disables the two upstream browser rows, inserts the `@graysilver` packages and the wrapper's Host plugin under product-owned row ids, and disables the telemetry row. Cordis patches treat an id and package name as an identity check rather than a rename, so the disable-and-insert composition is the only product replacement path. The child receives `DSH_TELEMETRY_DISABLED=1` as a second, launcher-level hard stop.

The public parser admits launch with an optional `--host 0.0.0.0`, help, version, and `doctor [--json] [--model]`. The all-interface form selects a complete product WebServer overlay while loopback remains the default. Profiles, headless runs, plugin management, configuration dumps, and the upstream `web` alias are deliberately absent. Non-Web source remains in the fork for upstream merges and compatibility testing, not as a product interface.

Plain HTTP LAN origins are not secure browser contexts, so their Web Crypto object omits `randomUUID()` even though `getRandomValues()` remains available. On an all-interface bind, the wrapper's Host plugin taps the served index and installs a UUID v4 adapter before the upstream shell scripts run; it preserves the native method when present and sets the version and variant bits over cryptographic random bytes when absent. This keeps the pinned upstream RPC carrier, workspace creation, and other browser UUID consumers usable without changing loopback pages. The product deliberately gives every origin admitted by the upstream-derived trusted Host list the same controls as localhost: exact configuration-plane routes bridge settings, credentials, model discovery, preset operations, and approved native operations to the canonical upstream API handler, while leaving Connection's shared RPC interceptor available to Typert and future compatible features. The browser wrapper reuses the upstream transport and advertises that equal capability to every explicitly served product origin. This is a DNS-rebinding fence, not authentication: any device that can reach an all-interface port receives that authority, so LAN mode is an explicit trusted-network-only option with no login boundary.

The launcher appends its absolute invoking directory as the `cwd` query parameter. `@graysilver/oh-my-dsh-task-modes` offers one explicit adoption action, calls the existing `workspaces.create({ path })`, starts that Workspace through `workspaces.startSession`, and removes the query parameter with `history.replaceState`. No path enters settings, local storage, or a new wire contract.

The same new-session seat offers three task modes over existing capability owners:

- Quick calls the scoped `conversation.send(task)`.
- Plan first executes `/plan` through `remote.commands`, requires a successful admission and command result, then sends the task.
- Autonomous executes `/goal <task>` and leaves continued rounds to the upstream Goal Driver.

The product does not reimplement plan or goal state. A missing current session, an unavailable command, and a rejected command result remain explicit user errors rather than falling back to another mode.

`@graysilver/oh-my-dsh-models` owns the two-step product onboarding. The first step states the local-data, telemetry, and permission boundaries. The DeepSeek step calls `llm.discoverModels` with the form's unsaved key and endpoint before calling `credentials.set`; a failed probe writes neither settings nor secrets. The wrapper's Host plugin owns that bounded, authenticated `/models` probe because the pinned upstream DeepSeek adapter does not register discovery. It accepts the key only in the one request, bounds the response body, never includes provider response text in an error, and returns model ids through the existing LLM API. The key remains write-only in the existing credential domain.

`doctor` reports a versioned JSON schema and a human rendering over bounded checks: supported Node, the exact upstream engine lock, product patch presence, data and workspace access, port 3080, and credential presence. `--model` adds one authenticated model-discovery request. Reports state only whether a key is configured and never include its value.

## Alternatives considered

**Remove every non-Web upstream source directory.** Rejected because a partial source tree cannot merge and validate upstream changes reliably. Product surface area is defined by the published package and parser, not by deleting internal sources used for synchronization.

**Fork and maintain a second Agent engine.** Rejected because sessions, tools, permissions, plans, goals, and new compatible features would drift from the upstream runtime. A version-pinned wrapper makes the actual engine auditable.

**Add a Host endpoint that returns the launch directory.** Rejected because the launcher already owns the directory and the existing Workspace API owns path adoption. A one-shot loopback URL handoff closes the path without widening the Host protocol.

**Expose the complete upstream CLI with friendlier defaults.** Rejected because the product promise is Web-only. A hidden switch or compatibility alias would create a second public contract and make later removal ambiguous.

**Persist the key and test it afterwards.** Rejected because a typo would leave an unusable credential behind and make "saved" look like "connected". Testing the unsaved probe first keeps the persistence boundary truthful.

## Consequences

The product can be installed and started with one command while continuing to consume the official Harness runtime. Its three task choices inherit upstream durability, presentation, permission, and failure semantics. The cost is a strict compatibility obligation between the product browser packages and the pinned upstream npm version; packed-install verification and the upstream sync PR are release gates for that obligation.

The current-directory URL is visible in browser history only until the user adopts it. It is appropriate for an explicitly exposed trusted-network product that already permits the same path through its workspace picker, but it is not an authorization token and must never be treated as one.

No mode silently degrades. Autonomous mode can refuse when a non-complete goal already exists, and Plan first can refuse when `/plan` is absent; those answers are shown so the user can resolve state deliberately.
