import "server-only"

/**
 * 기본은 최신 Flash 계열(신규 키/계정에서 2.0-flash 등 구 모델이 비활성화된 경우가 있음).
 * 다른 모델은 GEMINI_ANALYSIS_MODEL_ID 로 지정.
 */
export const DEFAULT_GEMINI_ANALYSIS_MODEL_ID = "gemini-2.5-flash"

export function getGeminiAnalysisModelId(): string {
  const id = process.env.GEMINI_ANALYSIS_MODEL_ID?.trim()
  return id || DEFAULT_GEMINI_ANALYSIS_MODEL_ID
}
