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
 * 기본: gemini-2.5-flash (신규 Google AI 키는 2.0-flash를 더 이상 쓸 수 없음).
 * 다른 모델은 GEMINI_ANALYSIS_MODEL_ID 로 지정 (접두사 `models/` 없이 `gemini-…` 만).
 */
export const DEFAULT_GEMINI_ANALYSIS_MODEL_ID = "gemini-2.5-flash"

/** env에 예전 기본값이 남아 있어도 신규 키에서 502가 나지 않도록 치환 */
const DEPRECATED_MODEL_ALIASES: Record<string, string> = {
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-flash-001": "gemini-2.5-flash",
}

export function getGeminiAnalysisModelId(): string {
  const fromEnv = process.env.GEMINI_ANALYSIS_MODEL_ID?.trim()
  const id = fromEnv
    ? normalizeGeminiModelId(fromEnv)
    : DEFAULT_GEMINI_ANALYSIS_MODEL_ID
  return DEPRECATED_MODEL_ALIASES[id] ?? id
}
