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
 * 기본: gemini-3.1-pro-preview — Search grounding·사고(Thinking) 지원.
 * 다른 모델은 GEMINI_ANALYSIS_MODEL_ID 로 지정 (접두사 `models/` 없이 `gemini-…` 만).
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview
 */
export const DEFAULT_GEMINI_ANALYSIS_MODEL_ID = "gemini-3.1-pro-preview"

/** 폐기 예정 모델 ID가 env에 남아 있을 때 최신 Pro로 치환 */
const DEPRECATED_MODEL_ALIASES: Record<string, string> = {
  "gemini-2.0-flash": "gemini-3.1-pro-preview",
  "gemini-2.0-flash-001": "gemini-3.1-pro-preview",
}

const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const
export type GeminiThinkingLevel = (typeof THINKING_LEVELS)[number]

/**
 * Gemini 3 계열 사고(Thinking) 모드 — @ai-sdk/google `providerOptions.google.thinkingConfig`.
 * 끄려면 `GEMINI_THINKING=false` (또는 `0`). 단계는 `GEMINI_THINKING_LEVEL` (기본 high).
 */
export function getGeminiAnalysisProviderOptions():
  | { google: { thinkingConfig: { thinkingLevel: GeminiThinkingLevel } } }
  | undefined {
  const off =
    process.env.GEMINI_THINKING === "false" ||
    process.env.GEMINI_THINKING === "0"
  if (off) return undefined

  const raw = process.env.GEMINI_THINKING_LEVEL?.trim().toLowerCase()
  const thinkingLevel: GeminiThinkingLevel = THINKING_LEVELS.includes(
    raw as GeminiThinkingLevel
  )
    ? (raw as GeminiThinkingLevel)
    : "high"

  return {
    google: {
      thinkingConfig: {
        thinkingLevel,
      },
    },
  }
}

export function getGeminiAnalysisModelId(): string {
  const fromEnv = process.env.GEMINI_ANALYSIS_MODEL_ID?.trim()
  const id = fromEnv
    ? normalizeGeminiModelId(fromEnv)
    : DEFAULT_GEMINI_ANALYSIS_MODEL_ID
  return DEPRECATED_MODEL_ALIASES[id] ?? id
}
