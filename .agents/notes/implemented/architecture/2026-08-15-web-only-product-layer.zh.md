# Agent Note: 基于上游 Harness 的纯 Web 产品层

Status: implemented

[English](2026-08-15-web-only-product-layer.md) | 中文

## 问题

DeepSeek Harness 提供可组合运行时和多种面向操作者的 CLI 表层。消费级产品需要更窄的承诺：安装一个包，打开本地浏览器工作台，安全连接 DeepSeek，并选择任务需要多少规划和自主性。复制运行时形成第二套引擎，会让每项上游改进都变成手工移植；公开 Harness 原始 CLI，则会让产品边界与上游无法区分。

执行命令时所在的项目目录还需要进入浏览器，但不应新增 Host API 或第二套工作区注册表。首次凭据设置不能持久化尚未测试的密钥，产品隐私默认值也不能依赖用户记得设置环境变量。

## 决策

`@graysilver/oh-my-dsh` 是一层薄可执行包装，运行 manifest 中精确记录的官方 `@deepseek-ai/dsh` 版本。无参数调用时，它用 `config/oh-my-dsh.patch.yml` 启动上游 `web` profile，使用独立的 `OH_MY_DSH_HOME` 根目录（默认 `~/.oh-my-dsh`），等待上游就绪 URL，然后用默认浏览器打开。产品 Patch 会禁用两个上游浏览器行，以产品自有行 id 插入 `@graysilver` 包和包装器的 Host 插件，并禁用遥测行。Cordis Patch 把 id 与包名视为身份校验而不是重命名操作，因此“禁用并插入”是唯一的产品替换路径。子进程还会收到 `DSH_TELEMETRY_DISABLED=1`，作为启动层的第二道硬关闭。

公开解析器只接受启动（可选 `--host 0.0.0.0`）、帮助、版本和 `doctor [--json] [--model]`。全接口形式会选择一份完整的产品 WebServer 覆盖，默认仍然使用回环地址。Profile、headless 运行、插件管理、配置转储以及上游 `web` 别名都刻意不提供。非 Web 源码留在 fork 中只为合并上游与兼容验证，不是产品界面。

明文 HTTP 局域网 origin 不是浏览器安全上下文，因此 Web Crypto 对象即使仍提供 `getRandomValues()`，也不会提供 `randomUUID()`。绑定所有接口时，包装器的 Host 插件会在上游 shell 脚本运行前对所提供的 index 加入 UUID v4 适配器；存在原生方法时保持不变，不存在时则用密码学随机字节生成并设置 version 与 variant 位。固定版本的上游 RPC carrier、工作区创建及其他浏览器 UUID 消费方因此可以正常使用，而回环页面不受影响。产品会刻意让上游派生的可信 Host 列表所允许的每个 origin 获得与 localhost 相同的控制能力：设置、凭据、模型发现、Preset 操作和已批准的原生操作通过精确的配置平面路由桥接到上游规范 API handler，同时保留 Connection 的共享 RPC interceptor 给 Typert 和未来兼容能力使用。浏览器包装器复用上游传输，并向每个显式提供的产品 origin 声明这种同等能力。这里的可信 Host 只是 DNS 重绑定防线，不是身份认证；任何能访问全接口端口的设备都会获得这些权限，因此局域网模式只适合显式启用的可信网络，而且没有登录隔离。

启动器把执行时的绝对目录作为 `cwd` 查询参数追加到 URL。`@graysilver/oh-my-dsh-task-modes` 提供一次明确的采用操作，调用既有 `workspaces.create({ path })`，再通过 `workspaces.startSession` 启动该 Workspace，并用 `history.replaceState` 删除查询参数。路径不进入设置、本地存储或新 wire 契约。

同一个新会话 seat 基于现有能力所有者提供三种任务模式：

- 快速执行调用 scoped `conversation.send(task)`。
- 先做计划通过 `remote.commands` 执行 `/plan`，要求 admission 与命令结果都成功，再发送任务。
- 自主完成执行 `/goal <task>`，后续轮次交给上游 Goal Driver。

产品不重新实现 plan 或 goal 状态。缺少当前会话、命令不可用以及命令结果被拒绝都会成为明确的用户错误，不会回退到其他模式。

`@graysilver/oh-my-dsh-models` 持有两步产品引导。第一步说明本地数据、遥测与权限边界。DeepSeek 步骤会先用表单中尚未保存的密钥和端点调用 `llm.discoverModels`，之后才可能调用 `credentials.set`；测试失败时既不写设置，也不写 secret。密钥仍然只写入既有凭据领域。这项有界、带认证的 `/models` probe 由包装器的 Host 插件持有，因为固定的上游 DeepSeek 适配器没有注册 discovery。插件只在单次请求中接收密钥，限制响应体大小，不会把提供方响应文本写入错误，并通过既有 LLM API 返回模型 id。

`doctor` 针对一组有界检查提供带版本号的 JSON schema 和人类可读输出：受支持 Node、精确的上游引擎锁、产品 Patch 是否存在、数据与工作区访问、3080 端口以及凭据是否存在。`--model` 增加一次带认证的模型发现请求。报告只说明是否配置密钥，绝不包含密钥值。

## 曾考虑的替代方案

**删除所有非 Web 上游源码目录。** 不采用：残缺源码树无法可靠合并和验证上游变更。产品表面积由已发布包和解析器定义，不由删除同步所需内部源码来定义。

**Fork 并维护第二套 Agent 引擎。** 不采用：会话、工具、权限、计划、目标和后续兼容特性都会与上游运行时漂移。精确版本包装让实际引擎可以审计。

**增加返回启动目录的 Host endpoint。** 不采用：启动器已经拥有目录，既有 Workspace API 拥有路径采用。一次性 loopback URL 交接能够闭环，无需扩大 Host 协议。

**公开完整上游 CLI，只提供更友好的默认值。** 不采用：产品承诺是纯 Web。隐藏开关或兼容别名会形成第二份公开契约，让未来移除变得含糊。

**先持久化密钥，再测试。** 不采用：输入错误会留下不可用凭据，并让“已保存”看起来像“已连接”。先测试未保存 probe，才能让持久化边界符合事实。

## 后果

产品可以一条命令安装启动，同时继续消费官方 Harness 运行时。三种任务选择继承上游的持久性、展示、权限与失败语义。代价是产品浏览器包与固定上游 npm 版本之间存在严格兼容责任；打包后安装验证和上游同步 PR 是这项责任的发布门槛。

当前目录 URL 只在用户采用前出现在浏览器历史中。对已显式暴露到可信网络、且允许通过工作区选择器输入同一路径的产品，这是合适的；但它不是授权 token，也绝不能被当作授权 token。

任何模式都不会静默降级。已有未完成 goal 时，自主完成可能被拒绝；缺少 `/plan` 时，先做计划可能被拒绝；这些回答会直接展示，让用户有意识地处理状态。
