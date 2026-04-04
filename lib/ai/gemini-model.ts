import "server-only"

/**
 * AI SDK는 요청 시 `models/${modelId}` 형태로 붙입니다.
 * env에 `models/gemini-...` 를 넣으면 `models/models/...` 가 되어
 * `GenerateContentRequest.model: unexpected model name format` 가 납니다.
 */
function normalizeGeminiModelId(raw: string): string {
  let id = raw.trim()
  id = id.replace(/^["']+|["']+$/g, "")
  if (id.startsWith("models/")) {
    id = id.slice("models/".length)
  }
  return id.trim()
}

/**
 * 기본은 최신 Flash 계열(신규 키/계정에서 2.0-flash 등 구 모델이 비활성화된 경우가 있음).
 * 다른 모델은 GEMINI_ANALYSIS_MODEL_ID 로 지정 (접두사 `models/` 없이 `gemini-…` 만).
 */
export const DEFAULT_GEMINI_ANALYSIS_MODEL_ID = "gemini-2.5-flash"

export function getGeminiAnalysisModelId(): string {
  const fromEnv = process.env.GEMINI_ANALYSIS_MODEL_ID?.trim()
  if (fromEnv) {
    return normalizeGeminiModelId(fromEnv)
  }
  return DEFAULT_GEMINI_ANALYSIS_MODEL_ID
}
