# Oh My DSH

[English](README.md) | 中文

Oh My DSH 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 构建的开箱即用、本地运行、只提供 Web 界面的产品。它继续使用上游的 Agent 运行时与插件生态，在此基础上增加明确的本地启动入口、首次设置、任务模式和独立发布链路。

这是一个完全独立的 fork，与 JarvisBot 无关，也不共享运行时、配置或发布流程。

## 开始使用

需要 Node.js 22.19+ 或 24+。

```sh
npx @graysilver/oh-my-dsh
```

命令会启动本地 Web 应用、打开浏览器，并把执行命令时所在的目录交给工作区页面。产品数据默认存放在 `~/.oh-my-dsh`；如需更换位置，可以设置 `OH_MY_DSH_HOME`。

## macOS Desktop

Desktop 版本会在 Electron 窗口内承载同一套 WebUI，并统一管理本地运行时进程。关闭窗口只会把应用隐藏到菜单栏；从 Tray 菜单选择退出才会停止运行时。开发时运行 `pnpm oh-my-dsh:desktop`，使用 `pnpm oh-my-dsh:desktop:package` 构建名为 `OhMyDSH`、支持 arm64 和 x64 的 Universal `.app` 与 `.dmg`。图标采用 LobeHub 提供的 [DeepSeek 鲸鱼 PNG](https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/deepseek.png)，合成在白色圆角方形画布上，并保留外部圆角所需的透明区域以匹配 macOS 图标遮罩。打包产物会把完整插件依赖闭包放在物理 `Resources/app` 目录树中，并在命令成功前启动完整的 Web profile，产物写入 `apps/oh-my-dsh-desktop/release/`。

Desktop 始终让本地运行时监听 `0.0.0.0:3080`，因此可信设备可以使用 Tray 中显示的 LAN 地址访问。LAN 客户端与 localhost 使用相同权限，包括设置、凭据、本地文件访问和已批准的命令；只应在可信网络中使用。若 3080 已被其他进程占用，Desktop 会直接报告冲突，不会替换或终止现有进程。

首次运行只有两个简短步骤：

1. 确认本地数据与权限边界。
2. 填入 DeepSeek API 密钥。系统会先调用模型发现接口测试密钥，通过后才写入本地凭据文件。

产品组装和启动环境都会关闭遥测。Agent 读写文件或执行命令时，仍然遵循 DeepSeek Harness 提供的权限与确认机制。

如需让同一局域网内的设备访问 WebUI，必须显式启用：

```sh
npx @graysilver/oh-my-dsh --host 0.0.0.0
```

该模式会让所有能够访问该端口的设备获得与 localhost 相同的 Oh My DSH 权限，包括提供方设置、凭据、模型发现、本机文件访问和已批准的命令执行。此模式没有登录隔离，请只在可信网络中使用，并在远程会话结束后停止进程；默认仍然只监听回环地址。

## 三种任务模式

- **快速执行**：把任务直接发送到当前会话。
- **先做计划**：先进入上游 `/plan` 模式，再发送任务，让方案在实施前保持可审阅。
- **自主完成**：创建上游的持久 `/goal`，由 Goal Driver 跨多轮持续推进，直到完成或遇到真实阻塞。

这三种模式只是对上游能力的产品化入口，不是三套独立 Agent 引擎。会话、工具、权限、目标、计划以及后续兼容的新特性，仍然来自 DeepSeek Harness。

## 对外命令

```text
oh-my-dsh
oh-my-dsh --host 0.0.0.0
oh-my-dsh doctor [--json] [--model]
oh-my-dsh --help
oh-my-dsh --version
```

产品刻意不公开 profile、headless、插件管理或 Harness 原始命令。仓库内部仍保留非 Web 的上游源码，只用于持续合并和验证上游变更，不属于 Oh My DSH 的产品界面。

`doctor` 会检查 Node 版本、产品与上游版本锁、产品 Patch、数据目录和工作区权限、3080 端口以及凭据是否存在。`--model` 还会真实测试模型发现链路；`--json` 输出带版本号的稳定结构，而且绝不会包含凭据值。

## 上游同步与发布

仓库保留两个 remote：

```text
origin    git@github.com:GraySilver/oh-my-dsh.git
upstream  https://github.com/deepseek-ai/deepseek-harness.git
```

定时工作流会把 `upstream/master` 合并到一条可审阅的 Draft PR，记录准确的上游提交，并让包装器对齐最新的官方 `@deepseek-ai/dsh` npm 版本；同步流程绝不发布。产品发布使用独立的 `oh-my-dsh-v*` 标签族，构建三个 `@graysilver` tarball，在全新消费者目录里安装验证，最后经过受保护 npm 环境审批后发布完全相同的产物。

这项拆分很重要：上游提交可能早于对应的官方 npm 包。源码合并负责证明兼容性；精确固定的 npm 版本则说明用户实际运行的是哪一版引擎。

## 从源码开发

```sh
git clone git@github.com:GraySilver/oh-my-dsh.git
cd oh-my-dsh
pnpm install
pnpm run build
pnpm oh-my-dsh
```

产品层的重点验证命令：

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

继承的架构和贡献约束仍记录在 [AGENTS.md](AGENTS.md)、[开发指南](docs/development.md)与[架构指南](docs/architecture.md)中。

## 许可证与上游归属

[MIT](LICENSE)。DeepSeek Harness 由 DeepSeek AI 开发，并继续作为本项目的上游运行时。第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
