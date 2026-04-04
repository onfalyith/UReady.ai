/** `/api/analyze`와 동일 — 공백·줄바꿈 제외 최소 글자 수 */
export const MIN_ANALYSIS_SIGNIFICANT_CHARS = 80

export function countSignificantChars(s: string): number {
  return s.replace(/\s/g, "").length
}
