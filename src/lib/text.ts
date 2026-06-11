/**
 * 文本度量：与 prompts 中「字数」约定一致（去空白后的字符数，中文按字计）
 */
export function countChars(text: string): number {
  return text.replace(/\s/g, '').length;
}
