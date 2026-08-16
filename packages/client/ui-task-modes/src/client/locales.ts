/** English task-mode labels and descriptions. */
export const en = {
  mode: 'Task mode', normal: 'Normal', firstPrinciples: 'First principles', review: 'Adversarial review',
  normalDescription: 'Send the task directly.', firstPrinciplesDescription: 'Add first-principles guidance to the system prompt.',
  reviewDescription: 'Ask a read-only child agent to audit this session.', reviewStarted: 'Review started',
}
/** Simplified Chinese task-mode labels and descriptions. */
export const zh = {
  mode: '任务模式', normal: '普通', firstPrinciples: '第一性原理', review: '对抗式审查',
  normalDescription: '直接发送任务。', firstPrinciplesDescription: '向 system prompt 注入第一性原理要求。',
  reviewDescription: '由只读子 Agent 审核当前 session。', reviewStarted: '已启动审查',
}
/** Locale keys shared by the task-mode label bundles. */
export type TaskModeKey = keyof typeof en
