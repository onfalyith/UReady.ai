import "server-only"

import { generateText, stepCountIs, type ProviderMetadata } from "ai"
import { google } from "@ai-sdk/google"
import { ZodError } from "zod"
import {
  presentationAnalysisSchema,
  type AnalysisMaterialMeta,
  type PresentationAnalysis,
  type PresentationIssue,
} from "@/lib/ai/schema"
import {
  buildChunkedPresentationUserPrompt,
  buildJsonRepairUserPrompt,
  buildPresentationUserPrompt,
  PRESENTATION_ANALYSIS_SYSTEM,
  PRESENTATION_JSON_REPAIR_SYSTEM,
} from "@/lib/ai/prompt"
import { getGeminiAnalysisModelId } from "@/lib/ai/gemini-model"

/**
 * 기본 한도(한 번에 모델에 넣는 본문 글자 수 상한).
 * 약 1회 분석·그라운딩 기준 1분 내외를 목표로 20만 자 근처로 둡니다.
 * `ANALYSIS_MODEL_MAX_INPUT_CHARS` 환경변수로 20_000~400_000 범위에서 재정의 가능.
 */
export const ANALYSIS_MODEL_MAX_INPUT_CHARS_DEFAULT = 200_000

/** 구간 경계에서 문맥 유지용 겹침(글자 수) */
const CHUNK_OVERLAP_CHARS = 2_500

const MIN_MODEL_INPUT_CHARS = 20_000
const MAX_MODEL_INPUT_CHARS = 400_000

export function getAnalysisModelMaxInputChars(): number {
  const raw = process.env.ANALYSIS_MODEL_MAX_INPUT_CHARS?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n >= MIN_MODEL_INPUT_CHARS && n <= MAX_MODEL_INPUT_CHARS) {
      return n
    }
  }
  return ANALYSIS_MODEL_MAX_INPUT_CHARS_DEFAULT
}

/** 하위 호환: 과거 이름 — 기본값 상수만 노출 */
export const ANALYSIS_MODEL_MAX_INPUT_CHARS = ANALYSIS_MODEL_MAX_INPUT_CHARS_DEFAULT

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
  /** 서버에서 모델로 보낸 본문 길이·잘림·구간 분할 여부 */
  materialMeta: AnalysisMaterialMeta
}

/** `chunkSize` 단위로 자르고, 다음 구간은 `overlap`만큼 앞과 겹칩니다. */
export function splitMaterialIntoChunks(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  if (text.length <= chunkSize) return [text]
  const safeOverlap = Math.min(Math.max(0, overlap), chunkSize - 1)
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    if (end >= text.length) break
    const nextStart = end - safeOverlap
    start = nextStart > start ? nextStart : end
  }
  return chunks
}

function issueDedupeKey(issue: PresentationIssue): string {
  const t = issue.originalText.replace(/\s+/g, " ").trim().slice(0, 320)
  if (t.length > 0) return t
  return `${issue.location}|${issue.logicalWeakness}`.slice(0, 320)
}

function dedupeMergedIssues(issues: PresentationIssue[]): PresentationIssue[] {
  const seen = new Set<string>()
  const out: PresentationIssue[] = []
  for (const issue of issues) {
    const k = issueDedupeKey(issue)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(issue)
  }
  return out
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

type PassResult = {
  analysis: PresentationAnalysis
  providerMetadata: ProviderMetadata | undefined
  groundingSteps: GroundingStepSnapshot[]
}

async function executePresentationAnalysisPass(
  userPrompt: string,
  repairMaterialExcerpt: string
): Promise<PassResult> {
  const modelId = getGeminiAnalysisModelId()

  const result = await generateText({
    model: google(modelId),
    stopWhen: stepCountIs(24),
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    system: PRESENTATION_ANALYSIS_SYSTEM,
    prompt: userPrompt,
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
    prompt: buildJsonRepairUserPrompt(repairMaterialExcerpt, salvage),
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

function offsetGroundingSteps(
  steps: GroundingStepSnapshot[],
  baseStep: number
): GroundingStepSnapshot[] {
  return steps.map((s) => ({
    ...s,
    stepNumber: baseStep + s.stepNumber,
  }))
}

/**
 * Gemini + Google Search 그라운딩. (도구 + API JSON 모드는 Gemini에서 동시 미지원 → 텍스트 JSON 후 Zod 검증)
 * 모델은 GEMINI_ANALYSIS_MODEL_ID 로 재정의 가능.
 *
 * 본문이 `getAnalysisModelMaxInputChars()` 이하면 1회 호출, 초과 시 겹침 구간 분할 후 순차 분석·이슈 병합.
 */
export async function runPresentationAnalysis(
  materialText: string
): Promise<RunPresentationAnalysisResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured")
  }

  const maxChars = getAnalysisModelMaxInputChars()
  const fullLen = materialText.length

  if (fullLen <= maxChars) {
    const pass = await executePresentationAnalysisPass(
      buildPresentationUserPrompt(materialText),
      materialText
    )
    return {
      ...pass,
      materialMeta: {
        charLengthOriginal: fullLen,
        charLengthSentToModel: fullLen,
        truncatedForModel: false,
        maxChars,
      },
    }
  }

  const chunks = splitMaterialIntoChunks(
    materialText,
    maxChars,
    CHUNK_OVERLAP_CHARS
  )

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[analyze] 긴 문서: ${chunks.length}구간 순차 분석 (원문 ${fullLen.toLocaleString("ko-KR")}자, 구간당 최대 ${maxChars.toLocaleString("ko-KR")}자, 겹침 ${CHUNK_OVERLAP_CHARS.toLocaleString("ko-KR")}자)`
    )
  }

  const mergedIssues: PresentationIssue[] = []
  const mergedGrounding: GroundingStepSnapshot[] = []
  let lastProvider: ProviderMetadata | undefined
  let stepBase = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const userPrompt = buildChunkedPresentationUserPrompt(
      chunk,
      i + 1,
      chunks.length
    )
    const pass = await executePresentationAnalysisPass(userPrompt, chunk)
    mergedIssues.push(...pass.analysis.issues)
    mergedGrounding.push(
      ...offsetGroundingSteps(pass.groundingSteps, stepBase)
    )
    stepBase += 10_000
    lastProvider = pass.providerMetadata ?? lastProvider
  }

  const deduped = dedupeMergedIssues(mergedIssues)
  const charsSentTotal = chunks.reduce((sum, c) => sum + c.length, 0)

  return {
    analysis: { issues: deduped },
    providerMetadata: lastProvider,
    groundingSteps: mergedGrounding,
    materialMeta: {
      charLengthOriginal: fullLen,
      charLengthSentToModel: charsSentTotal,
      truncatedForModel: false,
      maxChars,
      usedChunkedAnalysis: true,
      chunkCount: chunks.length,
    },
  }
}
