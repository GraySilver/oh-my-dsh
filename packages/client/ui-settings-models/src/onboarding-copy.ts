/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-08-15.1'

/** The product welcome and local-data boundary in both supported GUI locales. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: '欢迎使用 Oh My DSH',
    body: '这是一个开箱即用的本地 Web 工作台，由 DeepSeek Harness 驱动。项目文件、会话与凭据保存在你的电脑上；遥测默认关闭。\n\n接下来只需连接 DeepSeek，然后从快速执行、先做计划或自主完成三种模式中选择一种开始任务。Agent 在读写文件或执行命令时，仍会遵循 Harness 的权限与确认机制。',
    continueLabel: '开始设置',
  },
  en: {
    title: 'Welcome to Oh My DSH',
    body: 'This is a ready-to-use local Web workspace powered by DeepSeek Harness. Project files, sessions, and credentials stay on your computer, and telemetry is off by default.\n\nConnect DeepSeek, then choose Quick, Plan first, or Autonomous to begin. File writes and command execution continue to follow the Harness permission and confirmation model.',
    continueLabel: 'Set up',
  },
} as const
