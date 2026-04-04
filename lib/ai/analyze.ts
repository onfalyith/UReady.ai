import "server-only"

import { generateText, stepCountIs, type ProviderMetadata } from "ai"
import { google } from "@ai-sdk/google"
import { ZodError } from "zod"
import {
  presentationAnalysisSchema,
  type PresentationAnalysis,
} from "@/lib/ai/schema"
import {
  buildJsonRepairUserPrompt,
  buildPresentationUserPrompt,
  PRESENTATION_ANALYSIS_SYSTEM,
  PRESENTATION_JSON_REPAIR_SYSTEM,
} from "@/lib/ai/prompt"
import { getGeminiAnalysisModelId } from "@/lib/ai/gemini-model"

const MAX_INPUT_CHARS = 120_000

export type GroundingStepSnapshot = {
  stepNumber: number
  providerMetadata: ProviderMetadata | undefined
  sources: unknown[]
}

export type RunPresentationAnalysisResult = {
  analysis: PresentationAnalysis
  /** 최종 스텝 기준 provider 메타(향후 그라운딩 저장용) */
  providerMetadata: ProviderMetadata | undefined
  /** 모든 스텝의 메타·소스 스냅샷(감사·디버그·추후 저장) */
  groundingSteps: GroundingStepSnapshot[]
}

function truncateMaterial(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text
  return text.slice(0, MAX_INPUT_CHARS)
}

function collectGroundingSteps(
  steps: ReadonlyArray<{
    stepNumber: number
    providerMetadata: ProviderMetadata | undefined
    sources: readonly unknown[]
  }>
): GroundingStepSnapshot[] {
  return steps.map((s) => ({
    stepNumber: s.stepNumber,
    providerMetadata: s.providerMetadata,
    sources: [...s.sources],
  }))
}

/**
 * `generateText`의 `text`는 마지막 스텝만 반영됩니다. 마지막 스텝이 도구만 호출하고
 * 본문이 없으면 비어 있어, 그 전 스텝에 있던 JSON 답이 버려집니다.
 */
function getAggregatedAssistantText(result: {
  text: string
  steps: ReadonlyArray<{ text: string }>
}): string {
  let lastNonEmpty = ""
  for (const step of result.steps) {
    if (step.text?.trim()) lastNonEmpty = step.text
  }
  if (result.text?.trim()) lastNonEmpty = result.text
  return lastNonEmpty.trim()
}

function joinedStepTexts(result: {
  steps: ReadonlyArray<{ text: string }>
}): string {
  return result.steps
    .map((s) => s.text?.trim())
    .filter((t): t is string => Boolean(t))
    .join("\n\n")
}

function extractTextFromContentParts(
  parts: ReadonlyArray<{ type?: string; text?: string }> | undefined
): string {
  if (!parts?.length) return ""
  return parts
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
}

function textFromResponseMessages(
  messages: ReadonlyArray<{ role?: string; content?: unknown }> | undefined
): string {
  if (!messages?.length) return ""
  let last = ""
  for (const m of messages) {
    if (m.role !== "assistant") continue
    const c = m.content
    if (typeof c === "string") {
      if (c.trim()) last = c
    } else if (Array.isArray(c)) {
      const t = extractTextFromContentParts(
        c as ReadonlyArray<{ type?: string; text?: string }>
      )
      if (t.trim()) last = t
    }
  }
  return last.trim()
}

/** JSON 본문일 가능성이 높은 후보부터 파싱 시도 */
function jsonLikeness(s: string): number {
  const t = s.trim()
  if (!t) return -1
  let n = 0
  if (t.includes('"issues"')) n += 8
  else if (/issues/i.test(t)) n += 3
  if (t.includes("{")) n += 2
  if (t.includes("[")) n += 1
  return n
}

function collectAnalysisTextCandidates(result: {
  text: string
  steps: ReadonlyArray<{
    text: string
    content: ReadonlyArray<{ type?: string; text?: string }>
  }>
  response: { messages?: ReadonlyArray<{ role?: string; content?: unknown }> }
}): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (s: string) => {
    const t = s.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }

  push(getAggregatedAssistantText(result))
  push(textFromResponseMessages(result.response.messages))

  for (const step of result.steps) {
    push(extractTextFromContentParts(step.content))
    push(step.text)
  }

  push(result.text)
  push(joinedStepTexts(result))

  out.sort((a, b) => jsonLikeness(b) - jsonLikeness(a))
  return out
}

function parseJsonFromModelBlock(inner: string): unknown {
  const t = inner.trim()
  try {
    return JSON.parse(t) as unknown
  } catch {
    const b0 = t.indexOf("[")
    const b1 = t.lastIndexOf("]")
    if (b0 >= 0 && b1 > b0) {
      try {
        return JSON.parse(t.slice(b0, b1 + 1)) as unknown
      } catch {
        /* fall through */
      }
    }
    const c0 = t.indexOf("{")
    const c1 = t.lastIndexOf("}")
    if (c0 >= 0 && c1 > c0) {
      try {
        return JSON.parse(t.slice(c0, c1 + 1)) as unknown
      } catch {
        /* fall through */
      }
    }
    throw new Error("모델 응답에서 JSON을 파싱하지 못했습니다.")
  }
}

type GenerateTextResultLike = {
  text: string
  steps: ReadonlyArray<{
    text: string
    content: ReadonlyArray<{ type?: string; text?: string }>
  }>
  response: { messages?: ReadonlyArray<{ role?: string; content?: unknown }> }
}

function tryParsePresentationFromGenerateResult(
  result: GenerateTextResultLike
): { ok: true; data: PresentationAnalysis } | { ok: false; lastError: unknown } {
  const candidates = collectAnalysisTextCandidates(result)
  let lastError: unknown
  for (const raw of candidates) {
    try {
      return { ok: true, data: parsePresentationAnalysisFromModelText(raw) }
    } catch (e) {
      lastError = e
    }
  }
  if (candidates.length === 0 && result.text?.trim()) {
    try {
      return {
        ok: true,
        data: parsePresentationAnalysisFromModelText(result.text),
      }
    } catch (e) {
      lastError = e
    }
  }
  return { ok: false, lastError }
}

function throwParseFailure(lastError: unknown): never {
  if (lastError instanceof ZodError) {
    throw new Error(
      `분석 JSON 형식이 맞지 않습니다: ${lastError.message.slice(0, 500)}`
    )
  }
  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error("모델 응답에서 JSON을 파싱하지 못했습니다.")
}

/** Gemini는 도구 사용과 response_mime_type application/json 동시 사용을 지원하지 않음 → 텍스트에서 JSON만 추출 */
function parsePresentationAnalysisFromModelText(text: string): PresentationAnalysis {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : trimmed
  let parsed: unknown
  try {
    parsed = parseJsonFromModelBlock(candidate)
  } catch {
    throw new Error("모델 응답에서 JSON을 파싱하지 못했습니다.")
  }
  return presentationAnalysisSchema.parse(parsed)
}

/**
 * Gemini + Google Search 그라운딩. (도구 + API JSON 모드는 Gemini에서 동시 미지원 → 텍스트 JSON 후 Zod 검증)
 * 모델은 GEMINI_ANALYSIS_MODEL_ID 로 재정의 가능.
 */
export async function runPresentationAnalysis(
  materialText: string
): Promise<RunPresentationAnalysisResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured")
  }

  const modelId = getGeminiAnalysisModelId()
  const body = truncateMaterial(materialText)

  const result = await generateText({
    model: google(modelId),
    stopWhen: stepCountIs(24),
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    system: PRESENTATION_ANALYSIS_SYSTEM,
    prompt: buildPresentationUserPrompt(body),
  })

  const firstPass = tryParsePresentationFromGenerateResult(result)
  if (firstPass.ok) {
    return {
      analysis: firstPass.data,
      providerMetadata: result.providerMetadata,
      groundingSteps: collectGroundingSteps(result.steps),
    }
  }

  const salvage = collectAnalysisTextCandidates(result).join("\n\n---\n\n")
  if (!salvage.trim() && !result.text?.trim()) {
    throw new Error("모델이 비어 있는 응답을 반환했습니다. 잠시 후 다시 시도해 주세요.")
  }

  const repair = await generateText({
    model: google(modelId),
    stopWhen: stepCountIs(4),
    system: PRESENTATION_JSON_REPAIR_SYSTEM,
    prompt: buildJsonRepairUserPrompt(body, salvage),
  })

  const secondPass = tryParsePresentationFromGenerateResult(repair)
  if (secondPass.ok) {
    return {
      analysis: secondPass.data,
      providerMetadata: result.providerMetadata,
      groundingSteps: collectGroundingSteps(result.steps),
    }
  }

  throwParseFailure(secondPass.lastError ?? firstPass.lastError)
}
