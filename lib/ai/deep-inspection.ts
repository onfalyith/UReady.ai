import "server-only"

import { generateText, stepCountIs } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import {
  collectAnalysisTextCandidates,
  collectGroundingSteps,
  parseJsonFromModelBlock,
} from "@/lib/ai/analyze"
import {
  getGeminiAnalysisModelId,
  getGeminiAnalysisProviderOptions,
} from "@/lib/ai/gemini-model"
import {
  formatDualSourceInstructions,
  formatUserFocusSection,
} from "@/lib/ai/prompt"
import {
  presentationAnalysisSchema,
  type AnalysisMaterialMeta,
  type PresentationAnalysis,
} from "@/lib/ai/schema"
import type {
  GroundingStepSnapshot,
  RunPresentationAnalysisResult,
} from "@/lib/ai/analyze"
import {
  DEEP_AGENT1_CONTEXT_EXTRACTOR,
  DEEP_AGENT2_FACT_CHECKER,
  DEEP_AGENT3_SOCRATIC_DRAFTER,
  DEEP_AGENT4_MASTER_SYNTHESIZER,
} from "@/lib/ai/deep-inspection-prompts"

function geminiAnalysisExtras() {
  const o = getGeminiAnalysisProviderOptions()
  return o ? { providerOptions: o } : {}
}

function getDeepGenerateMaxSteps(): number {
  const raw = process.env.ANALYSIS_GENERATE_MAX_STEPS?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 8 && n <= 64) return n
  }
  return 40
}

function getDeepMaxSearchToolCalls(): number {
  const raw = process.env.ANALYSIS_MAX_SEARCH_QUERIES?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 20) return n
  }
  return 8
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

/** 문자열 안의 `{` `}` 는 무시하지 않고, 이스케이프된 `"` 만 고려한 단순 스캔으로 첫 번째 최상위 JSON 객체 구간을 잘라냅니다. */
function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{")
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (ch === "\\") {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function tryParseJsonChunk(chunk: string): unknown | null {
  const trimmed = chunk.trim()
  if (!trimmed) return null
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const inner0 = fenced ? fenced[1].trim() : trimmed
  try {
    return parseJsonFromModelBlock(inner0)
  } catch {
    const obj = extractBalancedJsonObject(inner0)
    if (obj) {
      try {
        return JSON.parse(obj) as unknown
      } catch {
        /* fall through */
      }
    }
    const obj2 = extractBalancedJsonObject(trimmed)
    if (obj2) {
      try {
        return JSON.parse(obj2) as unknown
      } catch {
        /* fall through */
      }
    }
  }
  return null
}

function parseJsonFromGenerateResult(result: {
  text: string
  reasoningText?: string | undefined
  steps: ReadonlyArray<{
    text: string
    reasoningText?: string | undefined
    content: ReadonlyArray<{ type?: string; text?: string }>
  }>
  response: { messages?: ReadonlyArray<{ role?: string; content?: unknown }> }
}): unknown {
  const candidates = collectAnalysisTextCandidates(result)
  for (const c of candidates) {
    const p = tryParseJsonChunk(c)
    if (p != null) return p
  }
  const joined = candidates.join("\n\n")
  const p2 = tryParseJsonChunk(joined)
  if (p2 != null) return p2
  throw new Error("심층 점검: 모델 응답에서 JSON을 파싱하지 못했습니다.")
}

const REPAIR_JSON_SYSTEM = `You repair and extract JSON only.
Rules:
- Output a single valid JSON value (object or array). No markdown, no code fences, no text before or after.
- If the input contains a JSON object with minor issues (trailing commas, truncated end), fix what you can.
- If multiple JSON objects appear, return the main one that matches the described role (globalContext, extractedStatements, issues, etc.).`

async function repairJsonWithModel(
  modelId: string,
  rawBlob: string,
  phaseLabel: string
): Promise<unknown> {
  const trimmed = rawBlob.trim().slice(0, 32_000)
  if (trimmed.length < 4) {
    throw new Error(
      `심층 점검(${phaseLabel}): 모델 출력이 비어 있어 JSON을 복구할 수 없습니다.`
    )
  }
  const repairResult = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(1),
    system: REPAIR_JSON_SYSTEM,
    prompt: `다음은 이전 단계 모델 출력입니다. 요구된 JSON 한 덩어리만 남기세요.\n\n---\n${trimmed}\n---`,
    maxOutputTokens: 24_576,
  })
  try {
    return parseJsonFromGenerateResult(repairResult)
  } catch {
    throw new Error(
      `심층 점검(${phaseLabel}): JSON 자동 복구에도 실패했습니다. 잠시 후 다시 시도해 주세요.`
    )
  }
}

async function parseJsonFromGenerateResultOrRepair(
  result: Parameters<typeof parseJsonFromGenerateResult>[0],
  modelId: string,
  phaseLabel: string
): Promise<unknown> {
  try {
    return parseJsonFromGenerateResult(result)
  } catch {
    const blob = collectAnalysisTextCandidates(result).join("\n\n")
    return repairJsonWithModel(modelId, blob, phaseLabel)
  }
}

function buildDeepUserMaterialBlock(
  material: string,
  userFocusNotes?: string | null,
  dualSourceMode?: boolean
): string {
  const focus = formatUserFocusSection(userFocusNotes)
  const dual = dualSourceMode ? formatDualSourceInstructions() : ""
  return `아래는 발표 자료 전체 텍스트입니다. 시스템 지시에 따라 출력하세요.
${dual}${focus}
---
${material}
---`
}

function analysisContextOnly(
  userFocusNotes?: string | null,
  dualSourceMode?: boolean
): string {
  const focus = formatUserFocusSection(userFocusNotes)
  const dual = dualSourceMode ? formatDualSourceInstructions() : ""
  const block = `${dual}${focus}`.trim()
  return block.length > 0
    ? `## 사용자·형식 맥락\n${block}\n`
    : ""
}

const agent1Shape = z.object({
  globalContext: z.object({
    target: z.string(),
    purpose: z.string(),
    tone: z.string(),
    coreIntent: z.string(),
  }),
  extractedStatements: z.array(
    z.object({
      id: z.number().int().positive(),
      location: z.string(),
      originalText: z.string(),
      categoryCheck: z.string(),
    })
  ),
})

export type DeepInspectionOptions = {
  userFocusNotes?: string | null
  dualSourceMode?: boolean
  charLengthOriginal: number
  charLengthSentToModel: number
  truncatedForModel: boolean
  maxChars: number
}

/**
 * 심층 점검: 4회 연속 generateText (Agent1 맥락·발췌 → Agent2 검색 팩트체크 → Agent3 소크라테스 초안 → Agent4 최종 issues).
 */
export async function runDeepInspectionPipeline(
  materialText: string,
  options: DeepInspectionOptions
): Promise<RunPresentationAnalysisResult> {
  const modelId = getGeminiAnalysisModelId()
  const maxSteps = getDeepGenerateMaxSteps()
  const maxSearch = getDeepMaxSearchToolCalls()
  const userBlock = buildDeepUserMaterialBlock(
    materialText,
    options.userFocusNotes,
    options.dualSourceMode === true
  )

  const agent1Result = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(1),
    system: DEEP_AGENT1_CONTEXT_EXTRACTOR,
    prompt: userBlock,
    maxOutputTokens: 16_384,
  })

  const j1 = await parseJsonFromGenerateResultOrRepair(
    agent1Result,
    modelId,
    "1단계 맥락·발췌"
  )
  const agent1 = agent1Shape.parse(j1)

  const agent2Prompt = `${analysisContextOnly(options.userFocusNotes, options.dualSourceMode === true)}
## Agent 1 출력 JSON (이 데이터만 근거로 팩트체크하세요)
${JSON.stringify(agent1)}

위 JSON에 evidence·sourceReliability를 채워 동일 스키마 규칙으로 **순수 JSON 한 객체**만 출력하세요.`

  const agent2Result = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(maxSteps),
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    system: DEEP_AGENT2_FACT_CHECKER,
    prompt: agent2Prompt,
    prepareStep: ({ steps }) => {
      const used = countToolCallsInSteps(steps)
      if (used >= maxSearch) {
        return { toolChoice: "none" as const }
      }
      return undefined
    },
    maxOutputTokens: 24_576,
  })

  const j2 = await parseJsonFromGenerateResultOrRepair(
    agent2Result,
    modelId,
    "2단계 팩트체크"
  )
  const agent2Grounding = collectGroundingSteps(agent2Result.steps)

  const agent3Prompt = `${analysisContextOnly(options.userFocusNotes, options.dualSourceMode === true)}
## Agent 2 출력 JSON
${JSON.stringify(j2)}

위 JSON에 logicalWeakness, counterArgument, improvementQuestion을 채우고 extractedStatements를 draftIssues로 바꾼 **순수 JSON 한 객체**만 출력하세요.`

  const agent3Result = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(1),
    system: DEEP_AGENT3_SOCRATIC_DRAFTER,
    prompt: agent3Prompt,
    maxOutputTokens: 24_576,
  })

  const j3parsed = await parseJsonFromGenerateResultOrRepair(
    agent3Result,
    modelId,
    "3단계 소크라테스 초안"
  )
  const j3raw = j3parsed as Record<string, unknown>
  if (
    j3raw &&
    !Array.isArray(j3raw.draftIssues) &&
    Array.isArray(j3raw.extractedStatements)
  ) {
    j3raw.draftIssues = j3raw.extractedStatements
    delete j3raw.extractedStatements
  }
  const j3 = j3raw

  const agent4Prompt = `${analysisContextOnly(options.userFocusNotes, options.dualSourceMode === true)}
## Agent 3 출력 JSON
${JSON.stringify(j3)}

위를 맥락 통합·정제하여 루트 키 \`issues\`만 있는 **순수 JSON 한 객체**만 출력하세요.`

  const agent4Result = await generateText({
    ...geminiAnalysisExtras(),
    model: google(modelId),
    stopWhen: stepCountIs(1),
    system: DEEP_AGENT4_MASTER_SYNTHESIZER,
    prompt: agent4Prompt,
    maxOutputTokens: 24_576,
  })

  const j4 = await parseJsonFromGenerateResultOrRepair(
    agent4Result,
    modelId,
    "4단계 최종 통합"
  )
  const analysis: PresentationAnalysis = presentationAnalysisSchema.parse(j4)

  const materialMeta: AnalysisMaterialMeta = {
    charLengthOriginal: options.charLengthOriginal,
    charLengthSentToModel: options.charLengthSentToModel,
    truncatedForModel: options.truncatedForModel,
    maxChars: options.maxChars,
    usedDeepInspection: true,
  }

  return {
    analysis,
    providerMetadata: agent4Result.providerMetadata,
    groundingSteps: agent2Grounding,
    materialMeta,
  }
}
