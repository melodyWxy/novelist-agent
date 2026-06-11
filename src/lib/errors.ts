/** 将 catch 到的 unknown 转为可展示/可持久化的错误文案 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 独立 LLM 任务（非周期链）失败时是否值得自动重试 */
export function isRetryableStandaloneLlmJobError(message: string): boolean {
  if (/402|insufficient balance|余额不足/i.test(message)) return false;
  if (/401|403|请先生成|需要 payload|不存在|未知任务|缺少世界线/i.test(message)) return false;
  if (/不是合法 JSON|Unexpected end of JSON|Unterminated string/i.test(message)) return true;
  if (/LLM 文本输出被截断/i.test(message)) return true;
  if (/aborted|timeout|timed out/i.test(message)) return true;
  if (/LLM API 错误 (429|5\d\d)/i.test(message)) return true;
  return false;
}
