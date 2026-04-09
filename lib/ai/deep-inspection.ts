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
  let lastErr: unknown
  for (const c of candidates) {
    try {
      const trimmed = c.trim()
      const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
      const inner = fenced ? fenced[1].trim() : trimmed
      return parseJsonFromModelBlock(inner)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("심층 점검: 모델 응답에서 JSON을 파싱하지 못했습니다.")
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

  const j1 = parseJsonFromGenerateResult(agent1Result)
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

  const j2 = parseJsonFromGenerateResult(agent2Result)
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

  const j3raw = parseJsonFromGenerateResult(agent3Result) as Record<
    string,
    unknown
  >
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

  const j4 = parseJsonFromGenerateResult(agent4Result)
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
