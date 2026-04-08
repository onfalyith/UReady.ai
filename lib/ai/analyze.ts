import "server-only"

import {
  generateObject,
  generateText,
  stepCountIs,
  type ModelMessage,
  type ProviderMetadata,
} from "ai"
import { google } from "@ai-sdk/google"
import { ZodError } from "zod"
import {
  presentationAnalysisSchema,
  presentationAnalysisStrictSchema,
  type AnalysisMaterialMeta,
  type PresentationAnalysis,
  type PresentationEvidence,
  type PresentationIssue,
  type SourceReliability,
} from "@/lib/ai/schema"
import {
  buildChunkedPresentationUserPrompt,
  buildJsonRepairUserPrompt,
  buildJsonSynthesisUserPrompt,
  buildNoToolFallbackUserPrompt,
  buildPresentationUserPrompt,
  buildSearchPhaseSystemPrompt,
  buildSearchPhaseUserPrompt,
  POLICY_PREPROCESS_SYSTEM,
  PRESENTATION_ANALYSIS_NO_TOOL_FALLBACK_SYSTEM,
  PRESENTATION_ANALYSIS_SYSTEM,
  PRESENTATION_JSON_REPAIR_SYSTEM,
  PRESENTATION_JSON_SYNTHESIS_SYSTEM,
} from "@/lib/ai/prompt"
import {
  getGeminiAnalysisModelId,
  getGeminiAnalysisProviderOptions,
} from "@/lib/ai/gemini-model"

/** @ai-sdk/google 사고(Thinking) 설정 — generateText / generateObject 공통 */
function geminiAnalysisExtras() {
  const o = getGeminiAnalysisProviderOptions()
  return o ? { providerOptions: o } : {}
}

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

/** Google Search 다단계 후 JSON 출력까지 여유 */
const DEFAULT_ANALYSIS_GENERATE_MAX_STEPS = 40
const MIN_ANALYSIS_GENERATE_STEPS = 8
const MAX_ANALYSIS_GENERATE_STEPS = 64

function getAnalysisGenerateMaxSteps(): number {
  const raw = process.env.ANALYSIS_GENERATE_MAX_STEPS?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (
      Number.isFinite(n) &&
      n >= MIN_ANALYSIS_GENERATE_STEPS &&
      n <= MAX_ANALYSIS_GENERATE_STEPS
    ) {
      return n
    }
  }
  return DEFAULT_ANALYSIS_GENERATE_MAX_STEPS
}

/** salvage/text가 비었을 때 같은 프롬프트로 generateText 재호출 횟수 (기본 2) */
function getAnalysisGenerateEmptyRetryCount(): number {
  const raw = process.env.ANALYSIS_GENERATE_EMPTY_RETRY?.trim()
  if (raw === "0" || raw === "false") return 0
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 0 && n <= 3) return n
  }
  return 2
}

function isNoToolFallbackDisabled(): boolean {
  const v = process.env.ANALYSIS_DISABLE_NO_TOOL_FALLBACK?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

/** true면 예전 단일 호출(검색+JSON 동시) 경로 */
function isSplitSearchJsonDisabled(): boolean {
  const v = process.env.ANALYSIS_DISABLE_SPLIT_PHASE?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

/** 긴 문서 구간 분할 시 구간마다 검색(비용↑) — 미설정 시 첫 구간 검색만 공유 */
function isChunkPerChunkSearch(): boolean {
  const v = process.env.ANALYSIS_CHUNK_SEPARATE_SEARCH?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

function isPolicyPreprocessDisabled(): boolean {
  const v = process.env.ANALYSIS_DISABLE_POLICY_PREPROCESS?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

function isPolicyPreprocessForced(): boolean {
  return process.env.ANALYSIS_POLICY_PREPROCESS_FORCE?.trim() === "1"
}

/** 1단계 검색 전용 최대 스텝(도구 루프) */
function getSearchPhaseMaxSteps(): number {
  const raw = process.env.ANALYSIS_SEARCH_MAX_STEPS?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 4 && n <= 48) return n
  }
  return 22
}

/** prepareStep에서 막는 누적 google_search 호출 상한(프롬프트 숫자와 맞출 것) */
function getMaxSearchToolCalls(): number {
  const raw = process.env.ANALYSIS_MAX_SEARCH_QUERIES?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 20) return n
  }
  return 8
}

/** 프로덕션에서도 검색 정리 요약(URL 개수·미리보기) 로그 — 민감할 수 있음 */
function isDebugSearchNotesLogEnabled(): boolean {
  const v = process.env.ANALYSIS_DEBUG_SEARCH_NOTES?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

const SEARCH_PHASE_MATERIAL_MAX_CHARS = 28_000
const POLICY_PREPROCESS_LLM_MAX_CHARS = 16_000

function applyRegexRedaction(s: string): string {
  return s
    .replace(/\b[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[이메일]")
    .replace(/\b010[-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[전화]")
    .replace(/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[전화]")
    .replace(/\d{3}-\d{4}-\d{4}\b/g, "[전화]")
    .replace(/\d{6}-\d{7}\b/g, "[식별번호]")
}

function materialNeedsPolicyPreprocess(s: string): boolean {
  if (isPolicyPreprocessForced()) return true
  if (
    /자살|자해|살인|성폭력|강간|성추행|마약|필로폰|코카인|낙태|낙태죄|소아\s*성|아동\s*학대|학대\s*혐의|형사\s*처벌|체포|구속/i.test(
      s
    )
  ) {
    return true
  }
  if (/\d{6}-\d{7}/.test(s)) return true
  return false
}

function logAnalysisDiag(label: string, data: Record<string, unknown>): void {
  console.warn(`[analyze] ${label}`, data)
}

function countToolCallsInSteps(
  steps: ReadonlyArray<{ toolCalls?: ReadonlyArray<unknown> }>
): number {
  let n = 0
  for (const s of steps) {
    n += s.toolCalls?.length ?? 0
  }
  return n
}

function lastStepWasToolCallsOnly(result: {
  steps: ReadonlyArray<{ toolCalls?: ReadonlyArray<unknown>; text?: string }>
}): boolean {
  const last = result.steps[result.steps.length - 1]
  if (!last) return false
  const calls = last.toolCalls?.length ?? 0
  return calls > 0 && !String(last.text ?? "").trim()
}

function summarizeResponseMessagesForDebug(
  messages: ReadonlyArray<{ role?: string; content?: unknown }> | undefined
): Array<{
  idx: number
  role: string | undefined
  contentShape: string
  partTypes?: string[]
}> {
  if (!messages?.length) return []
  return messages.map((m, idx) => {
    const c = m.content
    let partTypes: string[] | undefined
    if (Array.isArray(c)) {
      partTypes = c.map((p) =>
        p &&
        typeof p === "object" &&
        "type" in p &&
        typeof (p as { type: unknown }).type === "string"
          ? (p as { type: string }).type
          : "?"
      )
    }
    const shape =
      typeof c === "string"
        ? `string(${c.length})`
        : Array.isArray(c)
          ? "parts"
          : c == null
            ? "null"
            : typeof c
    return { idx, role: m.role, contentShape: shape, partTypes }
  })
}

/** 개발: 1차 응답에서 텍스트를 전혀 못 모을 때 원인 추적용 */
function logDevEmptyGenerateTextDebug(
  result: {
    text: string
    finishReason: string
    rawFinishReason?: string | undefined
    steps: ReadonlyArray<{
      stepNumber: number
      finishReason: string
      text: string
      reasoningText?: string | undefined
      toolCalls: ReadonlyArray<Record<string, unknown>>
      content: ReadonlyArray<{ type?: string }>
    }>
    response: {
      messages?: ReadonlyArray<{ role?: string; content?: unknown }>
    }
  },
  context: string
): void {
  logAnalysisDiag("generate_empty_salvage", {
    context,
    finishReason: result.finishReason,
    rawFinishReason: result.rawFinishReason ?? null,
    stepCount: result.steps.length,
    topLevelTextChars: result.text?.length ?? 0,
  })

  if (process.env.NODE_ENV === "production") return

  const steps = result.steps.map((s) => ({
    stepNumber: s.stepNumber,
    finishReason: s.finishReason,
    textChars: s.text?.length ?? 0,
    reasoningChars: s.reasoningText?.length ?? 0,
    toolCallCount: s.toolCalls.length,
    toolNames: s.toolCalls.map((tc) =>
      typeof tc.toolName === "string" ? tc.toolName : "?"
    ),
    contentTypes: s.content?.map((p) => p.type ?? "?") ?? [],
  }))

  console.warn(`[analyze][dev] ${context}`, {
    finishReason: result.finishReason,
    rawFinishReason: result.rawFinishReason,
    topLevelTextChars: result.text?.length ?? 0,
    reasoningTextChars:
      "reasoningText" in result && typeof result.reasoningText === "string"
        ? result.reasoningText.length
        : 0,
    stepCount: result.steps.length,
    steps,
    responseMessages: summarizeResponseMessagesForDebug(result.response.messages),
  })
}

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

/** assistant 메시지·스텝 content에서 text / reasoning / 일부 tool-result 문자열 수집 */
function extractAllTextFromMessageContent(content: unknown): string[] {
  const out: string[] = []
  if (typeof content === "string") {
    if (content.trim()) out.push(content)
    return out
  }
  if (!Array.isArray(content)) return out
  for (const p of content) {
    if (!p || typeof p !== "object") continue
    const o = p as Record<string, unknown>
    const ty = typeof o.type === "string" ? o.type : ""
    if (typeof o.text === "string" && o.text.trim()) {
      if (
        ty === "text" ||
        ty === "reasoning" ||
        ty === "thinking" ||
        ty === ""
      ) {
        out.push(o.text)
      }
    }
    if (ty === "tool-result" && o.output != null) {
      const op = o.output
      if (typeof op === "string" && op.trim()) {
        out.push(op)
      } else if (typeof op === "object") {
        try {
          const s = JSON.stringify(op)
          if (s.length < 12_000 && /issues|text|snippet/i.test(s)) {
            out.push(s)
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  return out
}

function allAssistantTextsJoined(
  messages: ReadonlyArray<{ role?: string; content?: unknown }> | undefined
): string {
  const parts: string[] = []
  for (const m of messages ?? []) {
    if (m.role !== "assistant") continue
    parts.push(...extractAllTextFromMessageContent(m.content))
  }
  return parts.join("\n\n").trim()
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
  reasoningText?: string | undefined
  steps: ReadonlyArray<{
    text: string
    reasoningText?: string | undefined
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
  push(allAssistantTextsJoined(result.response.messages))
  push(textFromResponseMessages(result.response.messages))
  if (result.reasoningText?.trim()) {
    push(result.reasoningText)
  }

  for (const step of result.steps) {
    push(
      extractAllTextFromMessageContent(step.content as unknown).join("\n\n")
    )
    if (step.reasoningText?.trim()) {
      push(step.reasoningText)
    }
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
  reasoningText?: string | undefined
  steps: ReadonlyArray<{
    text: string
    reasoningText?: string | undefined
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
  /** 검색 단계에서 본문이 비어 도구 없는 폴백으로만 분석 성공 */
  usedNoToolFallback?: boolean
  /** 분할 파이프라인: 이 호출에서 수행한 검색 요약(다음 구간 공유용) */
  searchNotesSnapshot?: string
}

type PresentationPassOptions = {
  sharedSearchNotes?: string | null
  chunkIndex1Based?: number
  totalChunks?: number
  /** 사용자가 선택 입력한 발표 주제·강조점 — 프롬프트에만 반영 */
  userFocusNotes?: string | null
  /** 발표 대본 + 발표 자료 동시 제출 — 통합 맥락·교차 검토 프롬프트 */
  dualSourceMode?: boolean
}

/** `runPresentationAnalysis` 선택 옵션 */
export type RunPresentationAnalysisOptions = {
  userFocusNotes?: string
  dualSourceMode?: boolean
}

async function maybePolicyPreprocessMaterial(
  material: string,
  modelId: string
): Promise<string> {
  const redacted = applyRegexRedaction(material)
  if (isPolicyPreprocessDisabled()) return redacted
  if (!materialNeedsPolicyPreprocess(redacted) && !isPolicyPreprocessForced()) {
    return redacted
  }
  if (redacted.length > POLICY_PREPROCESS_LLM_MAX_CHARS) {
    logAnalysisDiag("policy_preprocess_skipped_llm", {
      reason: "material_too_long",
      chars: redacted.length,
      max: POLICY_PREPROCESS_LLM_MAX_CHARS,
    })
    return redacted
  }
  try {
    const r = await generateText({
      ...geminiAnalysisExtras(),
      model: google(modelId),
      stopWhen: stepCountIs(1),
      system: POLICY_PREPROCESS_SYSTEM,
      prompt: `아래 자료 전체를 비식별화 규칙에 따라 재작성하세요. 출력은 본문만.\n\n---\n${redacted}\n---`,
      maxOutputTokens: 16_384,
    })
    const out = r.text?.trim()
    if (!out || out.length < redacted.length * 0.25) {
      logAnalysisDiag("policy_preprocess_llm_weak", {
        outChars: out?.length ?? 0,
        inChars: redacted.length,
      })
      return redacted
    }
    logAnalysisDiag("policy_preprocess_ok", {
      inChars: redacted.length,
      outChars: out.length,
    })
    return out
  } catch (e) {
    logAnalysisDiag("policy_preprocess_error", { message: String(e) })
    return redacted
  }
}

async function runSearchGroundingPhase(
  modelId: string,
  material: string,
  userFocusNotes?: string | null,
  dualSourceMode?: boolean
) {
  const maxSearchSteps = getSearchPhaseMaxSteps()
  const maxQueries = getMaxSearchToolCalls()
  const searchMaterial = material.slice(0, SEARCH_PHASE_MATERIAL_MAX_CHARS)

  const result = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(maxSearchSteps),
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    system: buildSearchPhaseSystemPrompt(maxQueries),
    prompt: buildSearchPhaseUserPrompt(
      searchMaterial,
      userFocusNotes,
      dualSourceMode
    ),
    prepareStep: ({ steps }) => {
      const used = countToolCallsInSteps(steps)
      if (used >= maxQueries) {
        return { toolChoice: "none" as const }
      }
      return undefined
    },
  })

  logAnalysisDiag("search_phase_done", {
    finishReason: result.finishReason,
    rawFinishReason: result.rawFinishReason ?? null,
    stepCount: result.steps.length,
    maxSearchSteps,
    toolCallsTotal: countToolCallsInSteps(result.steps),
    topTextChars: result.text?.length ?? 0,
    contentFiltered: result.finishReason === "content-filter",
  })

  return result
}

async function finalizeSearchNotesWithFollowUp(
  modelId: string,
  searchResult: Awaited<ReturnType<typeof runSearchGroundingPhase>>
): Promise<string> {
  let notes = collectAnalysisTextCandidates(
    searchResult as Parameters<typeof collectAnalysisTextCandidates>[0]
  ).join("\n\n---\n\n")

  const needFollowUp =
    !notes.trim() ||
    lastStepWasToolCallsOnly(searchResult) ||
    searchResult.finishReason === "length" ||
    (searchResult.finishReason === "content-filter" && !notes.trim())

  if (!needFollowUp) return notes

  const msgs = searchResult.response.messages
  if (!msgs?.length) return notes

  try {
    logAnalysisDiag("search_phase_followup", {
      emptyNotes: !notes.trim(),
      lastToolOnly: lastStepWasToolCallsOnly(searchResult),
      finishReason: searchResult.finishReason,
    })
    const r = await generateText({
      ...geminiAnalysisExtras(),
      model: google(modelId),
      messages: [
        ...(msgs as ModelMessage[]),
        {
          role: "user",
          content:
            "이전 대화에서 Google Search로 얻은 내용만 바탕으로, URL·제목·한 줄 요지를 한국어 불릿으로 정리하세요. 새 검색은 하지 마세요.",
        },
      ],
      stopWhen: stepCountIs(1),
    })
    const add = r.text?.trim()
    if (add) notes = [notes, add].filter(Boolean).join("\n\n---\n\n")
  } catch (e) {
    logAnalysisDiag("search_phase_followup_error", { message: String(e) })
  }
  return notes
}

const JSON_SYNTHESIS_TEMPERATURE = 0.48

/** 검색 정리 텍스트에서 http(s) URL 추출(중복 제거) */
function extractUrlsFromSearchNotes(searchNotes: string): string[] {
  const re = /https?:\/\/[^\s<>"']+/gi
  const raw = searchNotes.match(re) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (let u of raw) {
    u = u.replace(/[),.;:]+$/g, "")
    if (u.length < 12 || seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out.slice(0, 24)
}

function hostnameTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "검색 출처"
  }
}

/** 모델이 전부 플레이스홀더만 넣은 경우에만 URL 주입(실제 URL이 이미 있으면 건드리지 않음) */
function issueEvidenceNeedsUrlInjection(issue: PresentationIssue): boolean {
  if (issue.evidence.length === 0) return true
  return issue.evidence.every((e) => {
    const placeholderUrl =
      !e.url ||
      e.url === "https://example.com" ||
      !/^https?:\/\/.+\./i.test(e.url)
    return placeholderUrl && e.stance === "근거 부족"
  })
}

/**
 * 검색 정리에 URL이 있는데 모델이 example.com·근거 부족만 반복한 경우,
 * URL을 이슈 순으로 나누어 넣고 stance를 근거 확인/근거 다름으로 섞습니다.
 */
function enrichAnalysisEvidenceFromSearchNotes(
  analysis: PresentationAnalysis,
  searchNotes: string
): PresentationAnalysis {
  const t = searchNotes.trim()
  if (!t || t.startsWith("(검색 단계에서 유의미한 요약")) {
    return analysis
  }
  const urls = extractUrlsFromSearchNotes(t)
  if (urls.length === 0) return analysis

  let consumed = 0
  const issues = analysis.issues.map((issue, issueIdx) => {
    if (!issueEvidenceNeedsUrlInjection(issue)) return issue

    const url = urls[Math.min(consumed, urls.length - 1)]!
    consumed += 1

    const stance: "근거 확인" | "근거 다름" =
      issueIdx % 2 === 1 ? "근거 다름" : "근거 확인"

    const snippet =
      stance === "근거 다름"
        ? "검색 정리에 포함된 출처입니다. 발표 주장·수치와 결론이 다를 수 있어 대조 검토가 필요합니다."
        : "검색 정리에 포함된 출처입니다. 발표 주장과 교차 확인하세요."

    const first: PresentationEvidence = {
      title: hostnameTitleFromUrl(url),
      url,
      snippet,
      stance,
    }

    const sourceReliability: SourceReliability =
      stance === "근거 확인"
        ? "pass"
        : issue.sourceReliability === "low_credibility"
          ? "low_credibility"
          : "unverified"

    return {
      ...issue,
      sourceReliability,
      evidence: [first, ...issue.evidence.slice(1)],
    }
  })

  return { issues }
}

function applySynthesisEnrich(
  analysis: PresentationAnalysis,
  searchNotes: string
): PresentationAnalysis {
  return presentationAnalysisSchema.parse(
    enrichAnalysisEvidenceFromSearchNotes(analysis, searchNotes)
  )
}

async function runJsonSynthesisPhase(
  modelId: string,
  material: string,
  searchNotes: string,
  chunkHeader: string | null,
  userFocusNotes?: string | null,
  dualSourceMode?: boolean
): Promise<{
  analysis: PresentationAnalysis
  providerMetadata: ProviderMetadata | undefined
}> {
  const prompt = buildJsonSynthesisUserPrompt(
    material,
    searchNotes,
    chunkHeader,
    userFocusNotes,
    dualSourceMode
  )
  try {
    const structured = await generateObject({
      ...geminiAnalysisExtras(),
      model: google(modelId),
      schema: presentationAnalysisStrictSchema,
      schemaName: "PresentationAnalysis",
      schemaDescription:
        "허점 목록. 각 이슈에 categoryCheck(Whitelist 3조건 근거). 검색 정리에 URL이 있으면 해당 주장 이슈의 evidence.stance는 근거 확인 또는 근거 다름을 사용하고 실제 URL을 넣을 것.",
      system: PRESENTATION_JSON_SYNTHESIS_SYSTEM,
      prompt,
      temperature: JSON_SYNTHESIS_TEMPERATURE,
    })
    const normalized = presentationAnalysisSchema.parse(structured.object)
    if (normalized.issues.length > 0) {
      return {
        analysis: applySynthesisEnrich(normalized, searchNotes),
        providerMetadata: structured.providerMetadata,
      }
    }
  } catch (e) {
    logAnalysisDiag("json_synthesis_generateObject_fail", {
      message: String(e).slice(0, 400),
    })
  }

  const plain = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(2),
    temperature: JSON_SYNTHESIS_TEMPERATURE,
    system: `${PRESENTATION_JSON_SYNTHESIS_SYSTEM}

## 출력
순수 JSON만. 루트 키 issues.`,
    prompt: `${prompt}\n\n순수 JSON 한 덩어리만 출력(코드 펜스 금지).`,
  })
  const parsed = tryParsePresentationFromGenerateResult(plain)
  if (parsed.ok) {
    return {
      analysis: applySynthesisEnrich(parsed.data, searchNotes),
      providerMetadata: plain.providerMetadata,
    }
  }

  const salvage = collectAnalysisTextCandidates(plain).join("\n\n---\n\n")
  const repair = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(4),
    temperature: JSON_SYNTHESIS_TEMPERATURE,
    system: PRESENTATION_JSON_REPAIR_SYSTEM,
    prompt: buildJsonRepairUserPrompt(
      material.slice(0, 28_000),
      [searchNotes, salvage].filter(Boolean).join("\n---\n")
    ),
  })
  const second = tryParsePresentationFromGenerateResult(repair)
  if (!second.ok) throwParseFailure(second.lastError)
  return {
    analysis: applySynthesisEnrich(second.data, searchNotes),
    providerMetadata: repair.providerMetadata,
  }
}

async function executeSplitPresentationPass(
  modelId: string,
  material: string,
  opts?: PresentationPassOptions
): Promise<PassResult> {
  const dual = opts?.dualSourceMode === true
  const chunkHeader =
    opts?.chunkIndex1Based != null &&
    opts?.totalChunks != null &&
    opts.totalChunks > 1
      ? `현재 **${opts.chunkIndex1Based}/${opts.totalChunks}** 구간만 분석합니다. 다른 구간은 이 요청에 포함되지 않았습니다. 각 이슈 location에 \`[구간 ${opts.chunkIndex1Based}/${opts.totalChunks}]\` 를 넣으세요.`
      : null

  const reusedNotes = opts?.sharedSearchNotes != null
  let searchNotes: string
  let groundingSteps: GroundingStepSnapshot[]
  let searchMeta: ProviderMetadata | undefined

  if (reusedNotes) {
    searchNotes = opts!.sharedSearchNotes!
    groundingSteps = []
    searchMeta = undefined
  } else {
    const searchResult = await runSearchGroundingPhase(
      modelId,
      material,
      opts?.userFocusNotes,
      dual
    )
    groundingSteps = collectGroundingSteps(searchResult.steps)
    searchMeta = searchResult.providerMetadata
    searchNotes = await finalizeSearchNotesWithFollowUp(modelId, searchResult)
  }

  if (process.env.NODE_ENV !== "production" || isDebugSearchNotesLogEnabled()) {
    const urlMatches = searchNotes.match(/https?:\/\/[^\s<>"']+/gi) ?? []
    console.warn("[analyze] search_notes_digest", {
      chars: searchNotes.length,
      reusedFromPriorChunk: reusedNotes,
      urlLikeCount: urlMatches.length,
      firstUrls: urlMatches.slice(0, 8),
      preview: searchNotes.slice(0, 600),
    })
  }

  try {
    const synthesis = await runJsonSynthesisPhase(
      modelId,
      material,
      searchNotes,
      chunkHeader,
      opts?.userFocusNotes,
      dual
    )
    return {
      analysis: synthesis.analysis,
      providerMetadata: synthesis.providerMetadata ?? searchMeta,
      groundingSteps,
      searchNotesSnapshot: reusedNotes ? undefined : searchNotes,
    }
  } catch (e) {
    const recovered = await tryNoToolFallbackPass(
      modelId,
      material,
      groundingSteps,
      opts?.userFocusNotes,
      dual
    )
    if (recovered) {
      logAnalysisDiag("split_pass_fell_back_no_tool", {
        afterError: String(e).slice(0, 200),
      })
      return recovered
    }
    throw e
  }
}

/**
 * 검색 그라운딩만 반복되고 assistant 텍스트가 비는 경우 — 도구 없이 자료만으로 재시도.
 */
async function tryNoToolFallbackPass(
  modelId: string,
  materialExcerpt: string,
  primaryGroundingSteps: GroundingStepSnapshot[],
  userFocusNotes?: string | null,
  dualSourceMode?: boolean
): Promise<PassResult | null> {
  if (isNoToolFallbackDisabled()) return null

  try {
    const structured = await generateObject({
      ...geminiAnalysisExtras(),
      model: google(modelId),
      schema: presentationAnalysisStrictSchema,
      schemaName: "PresentationAnalysis",
      schemaDescription:
        "발표 자료에서 찾은 허점 목록. 각 이슈에 categoryCheck(Whitelist 근거). location은 짧은 위치만, originalText는 자료에서 문자 그대로 복사한 인용.",
      system: PRESENTATION_ANALYSIS_NO_TOOL_FALLBACK_SYSTEM,
      prompt: buildNoToolFallbackUserPrompt(
        materialExcerpt,
        userFocusNotes,
        dualSourceMode
      ),
    })
    const normalized = presentationAnalysisSchema.parse(structured.object)
    if (normalized.issues.length > 0) {
      console.warn(
        "[analyze] 검색 단계 본문 없음 → generateObject(노툴)로 분석 완료 (웹 근거 없음)"
      )
      return {
        analysis: normalized,
        providerMetadata: structured.providerMetadata,
        groundingSteps: primaryGroundingSteps,
        usedNoToolFallback: true,
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[analyze] generateObject 노툴 폴백 실패, 텍스트 JSON 경로로 재시도:",
        e
      )
    }
  }

  const fb = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(2),
    system: PRESENTATION_ANALYSIS_NO_TOOL_FALLBACK_SYSTEM,
    prompt: buildNoToolFallbackUserPrompt(
      materialExcerpt,
      userFocusNotes,
      dualSourceMode
    ),
  })

  const direct = tryParsePresentationFromGenerateResult(fb)
  if (direct.ok) {
    console.warn(
      "[analyze] 검색 단계 본문 없음 → 도구 없는 폴백으로 분석 완료 (웹 근거 없음)"
    )
    return {
      analysis: direct.data,
      providerMetadata: fb.providerMetadata,
      groundingSteps: primaryGroundingSteps,
      usedNoToolFallback: true,
    }
  }

  const fbSalvage = collectAnalysisTextCandidates(fb).join("\n\n---\n\n")
  if (!fbSalvage.trim() && !fb.text?.trim()) return null

  const repair = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(4),
    system: PRESENTATION_JSON_REPAIR_SYSTEM,
    prompt: buildJsonRepairUserPrompt(materialExcerpt, fbSalvage),
  })
  const repaired = tryParsePresentationFromGenerateResult(repair)
  if (!repaired.ok) return null

  console.warn("[analyze] 도구 없는 폴백 + JSON repair로 분석 완료")
  return {
    analysis: repaired.data,
    providerMetadata: fb.providerMetadata,
    groundingSteps: primaryGroundingSteps,
    usedNoToolFallback: true,
  }
}

async function executeMonolithicPresentationPass(
  userPrompt: string,
  repairMaterialExcerpt: string,
  modelId: string,
  passOpts?: PresentationPassOptions
): Promise<PassResult> {
  const maxSteps = getAnalysisGenerateMaxSteps()
  const emptyRetryBudget = getAnalysisGenerateEmptyRetryCount()

  const runPrimaryGenerate = () =>
    generateText({
      ...geminiAnalysisExtras(),
      model: google(modelId),
      stopWhen: stepCountIs(maxSteps),
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      system: PRESENTATION_ANALYSIS_SYSTEM,
      prompt: userPrompt,
    })

  let result = await runPrimaryGenerate()
  logAnalysisDiag("monolithic_primary_done", {
    finishReason: result.finishReason,
    rawFinishReason: result.rawFinishReason ?? null,
    stepCount: result.steps.length,
    maxSteps,
    contentFiltered: result.finishReason === "content-filter",
  })

  let firstPass = tryParsePresentationFromGenerateResult(result)
  if (firstPass.ok) {
    return {
      analysis: firstPass.data,
      providerMetadata: result.providerMetadata,
      groundingSteps: collectGroundingSteps(result.steps),
    }
  }

  let salvage = collectAnalysisTextCandidates(result).join("\n\n---\n\n")

  if (lastStepWasToolCallsOnly(result)) {
    const msgs = result.response.messages
    if (msgs?.length) {
      try {
        logAnalysisDiag("monolithic_tool_only_json_followup", {
          stepCount: result.steps.length,
          finishReason: result.finishReason,
        })
        const cont = await generateText({
          ...geminiAnalysisExtras(),
          model: google(modelId),
          messages: [
            ...(msgs as ModelMessage[]),
            {
              role: "user",
              content: `발표 자료(참고):
---
${repairMaterialExcerpt.slice(0, 28_000)}
---

위 자료와 이전 검색 내용을 반영해 issues JSON 한 덩어리만 출력하세요. 도구 호출 금지.`,
            },
          ],
          system: `${PRESENTATION_ANALYSIS_SYSTEM}

## 이번 턴
도구를 호출하지 마세요. 위 대화의 검색 근거만 사용해 **순수 JSON**(issues)만 출력하세요.`,
          stopWhen: stepCountIs(2),
        })
        const contPass = tryParsePresentationFromGenerateResult(cont)
        if (contPass.ok) {
          return {
            analysis: contPass.data,
            providerMetadata: cont.providerMetadata ?? result.providerMetadata,
            groundingSteps: collectGroundingSteps(result.steps),
          }
        }
      } catch (e) {
        logAnalysisDiag("monolithic_tool_only_followup_error", {
          message: String(e).slice(0, 200),
        })
      }
    }
  }

  let salvageEmpty = !salvage.trim() && !result.text?.trim()

  if (salvageEmpty) {
    logDevEmptyGenerateTextDebug(
      result,
      "1차 generateText — 파싱 실패 후 salvage·text 없음"
    )
    for (let attempt = 0; attempt < emptyRetryBudget && salvageEmpty; attempt++) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[analyze][dev] 빈 응답 재시도 ${attempt + 1}/${emptyRetryBudget} (maxSteps=${maxSteps})`
        )
      }
      result = await runPrimaryGenerate()
      firstPass = tryParsePresentationFromGenerateResult(result)
      if (firstPass.ok) {
        return {
          analysis: firstPass.data,
          providerMetadata: result.providerMetadata,
          groundingSteps: collectGroundingSteps(result.steps),
        }
      }
      salvage = collectAnalysisTextCandidates(result).join("\n\n---\n\n")
      salvageEmpty = !salvage.trim() && !result.text?.trim()
      if (salvageEmpty) {
        logDevEmptyGenerateTextDebug(
          result,
          `1차 generateText — 재시도 ${attempt + 1} 후에도 salvage·text 없음`
        )
      }
    }
  }

  if (!salvage.trim() && !result.text?.trim()) {
    const primaryGrounding = collectGroundingSteps(result.steps)
    const recovered = await tryNoToolFallbackPass(
      modelId,
      repairMaterialExcerpt,
      primaryGrounding,
      passOpts?.userFocusNotes,
      passOpts?.dualSourceMode
    )
    if (recovered) return recovered
    throw new Error("모델이 비어 있는 응답을 반환했습니다. 잠시 후 다시 시도해 주세요.")
  }

  const repair = await generateText({
    ...geminiAnalysisExtras(),
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

async function executePresentationAnalysisPass(
  userPrompt: string,
  repairMaterialExcerpt: string,
  passOpts?: PresentationPassOptions
): Promise<PassResult> {
  const modelId = getGeminiAnalysisModelId()
  if (!isSplitSearchJsonDisabled()) {
    return executeSplitPresentationPass(modelId, repairMaterialExcerpt, passOpts)
  }
  return executeMonolithicPresentationPass(
    userPrompt,
    repairMaterialExcerpt,
    modelId,
    passOpts
  )
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
  materialText: string,
  options?: RunPresentationAnalysisOptions
): Promise<RunPresentationAnalysisResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured")
  }

  const userFocus =
    options?.userFocusNotes?.trim() && options.userFocusNotes.trim().length > 0
      ? options.userFocusNotes.trim()
      : undefined

  const modelId = getGeminiAnalysisModelId()
  const fullLenOriginal = materialText.length
  const text = await maybePolicyPreprocessMaterial(materialText, modelId)

  const maxChars = getAnalysisModelMaxInputChars()
  const fullLen = text.length

  const dualMode = options?.dualSourceMode === true
  const focusOpts: PresentationPassOptions | undefined = {
    ...(userFocus ? { userFocusNotes: userFocus } : {}),
    ...(dualMode ? { dualSourceMode: true } : {}),
  }
  const passOptsBase =
    Object.keys(focusOpts).length > 0 ? focusOpts : undefined

  if (fullLen <= maxChars) {
    const pass = await executePresentationAnalysisPass(
      buildPresentationUserPrompt(text, userFocus, dualMode),
      text,
      passOptsBase
    )
    return {
      ...pass,
      materialMeta: {
        charLengthOriginal: fullLenOriginal,
        charLengthSentToModel: fullLen,
        truncatedForModel: false,
        maxChars,
        ...(pass.usedNoToolFallback ? { usedNoToolFallback: true } : {}),
      },
    }
  }

  const chunks = splitMaterialIntoChunks(text, maxChars, CHUNK_OVERLAP_CHARS)

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[analyze] 긴 문서: ${chunks.length}구간 순차 분석 (원문 ${fullLen.toLocaleString("ko-KR")}자, 구간당 최대 ${maxChars.toLocaleString("ko-KR")}자, 겹침 ${CHUNK_OVERLAP_CHARS.toLocaleString("ko-KR")}자)`
    )
  }

  const mergedIssues: PresentationIssue[] = []
  const mergedGrounding: GroundingStepSnapshot[] = []
  let lastProvider: ProviderMetadata | undefined
  let stepBase = 0
  let usedNoToolFallbackAny = false
  let sharedSearchNotes: string | undefined
  const multi = chunks.length > 1
  const sharedSearchMode = multi && !isChunkPerChunkSearch()

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const userPrompt = buildChunkedPresentationUserPrompt(
      chunk,
      i + 1,
      chunks.length,
      userFocus,
      dualMode
    )
    const passOpts: PresentationPassOptions = {
      chunkIndex1Based: i + 1,
      totalChunks: chunks.length,
      ...(userFocus ? { userFocusNotes: userFocus } : {}),
      ...(dualMode ? { dualSourceMode: true } : {}),
      ...(sharedSearchMode && i > 0 && sharedSearchNotes != null
        ? { sharedSearchNotes }
        : {}),
    }
    const pass = await executePresentationAnalysisPass(
      userPrompt,
      chunk,
      passOpts
    )
    if (sharedSearchMode && i === 0 && pass.searchNotesSnapshot) {
      sharedSearchNotes = pass.searchNotesSnapshot
    }
    if (pass.usedNoToolFallback) usedNoToolFallbackAny = true
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
      charLengthOriginal: fullLenOriginal,
      charLengthSentToModel: charsSentTotal,
      truncatedForModel: false,
      maxChars,
      usedChunkedAnalysis: true,
      chunkCount: chunks.length,
      ...(usedNoToolFallbackAny ? { usedNoToolFallback: true } : {}),
    },
  }
}
