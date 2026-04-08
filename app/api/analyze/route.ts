import { z } from "zod"
import {
  analyzeRateLimitResponse,
  getRequestFingerprint,
  rateLimitAnalyze,
} from "@/lib/rate-limit/upstash"
import { runPresentationAnalysis } from "@/lib/ai/analyze"
import {
  materialMetaSchema,
  presentationAnalysisSchema,
  type PresentationAnalysis,
} from "@/lib/ai/schema"
import { savePresentationAnalysisRecord } from "@/lib/db/persist/presentation-pipeline"
import {
  countSignificantChars,
  MIN_ANALYSIS_SIGNIFICANT_CHARS,
} from "@/lib/uready/analysis-limits"

export const runtime = "nodejs"

const MAX_TEXT_CHARS = 500_000

const bodySchema = z.object({
  text: z
    .string()
    .min(1, "text is required")
    .max(MAX_TEXT_CHARS, "text too long"),
  /** 선택: 발표 주제·강조점 — 분석 프롬프트에 반영 */
  userFocusNotes: z.string().max(12_000).optional(),
  /** 발표 대본 + 발표 자료 동시 제출 — 통합·교차 검토 프롬프트 */
  dualSourceMode: z.boolean().optional(),
})

export async function POST(request: Request) {
  const limited = await rateLimitAnalyze(request)
  if (!limited.ok) {
    return analyzeRateLimitResponse(limited.denied)
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json(
      { error: "JSON 본문이 필요합니다." },
      { status: 400 }
    )
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const msg =
      flat.fieldErrors.text?.[0] ??
      flat.formErrors[0] ??
      "유효하지 않은 입력입니다."
    return Response.json({ error: msg }, { status: 400 })
  }

  const { text, userFocusNotes, dualSourceMode } = parsed.data
  const trimmed = text.trim()
  const focusTrimmed = userFocusNotes?.trim()

  if (countSignificantChars(trimmed) < MIN_ANALYSIS_SIGNIFICANT_CHARS) {
    return Response.json(
      {
        error:
          "분석할 내용이 없습니다. 공백이 아닌 글자를 1자 이상 보내 주세요.",
      },
      { status: 400 }
    )
  }

  try {
    const { analysis, providerMetadata, groundingSteps, materialMeta } =
      await runPresentationAnalysis(trimmed, {
        ...(focusTrimmed ? { userFocusNotes: focusTrimmed } : {}),
        ...(dualSourceMode === true ? { dualSourceMode: true } : {}),
      })

    const metaValidated = materialMetaSchema.parse(materialMeta)

    const validated: PresentationAnalysis =
      presentationAnalysisSchema.parse(analysis)

    try {
      await savePresentationAnalysisRecord({
        sourceText: trimmed,
        sourceKind: "text",
        analysis: validated,
        providerMetadata,
        groundingSteps,
        clientIdentifier: getRequestFingerprint(request),
      })
    } catch (persistErr) {
      console.error(
        "[api/analyze] Supabase 저장 실패 — 분석 결과는 그대로 반환합니다.",
        persistErr
      )
    }

    const responseBody = {
      issues: validated.issues,
      materialMeta: metaValidated,
    }

    return Response.json(responseBody)
  } catch (e) {
    const raw = e instanceof Error ? e.message : "분석 실패"
    console.error("[api/analyze]", e)

    const missingKey =
      raw.includes("GOOGLE_GENERATIVE_AI_API_KEY") ||
      raw.includes("not configured")
    const quotaLike =
      /quota|exceeded|rate.?limit|429|resource_exhausted/i.test(raw)

    const status = missingKey ? 503 : 502
    let error = missingKey
      ? "Gemini API 키가 없습니다. 프로젝트 루트의 .env.local 파일에 GOOGLE_GENERATIVE_AI_API_KEY=발급받은키 를 넣고, 개발 서버(npm run dev)를 한 번 재시작한 뒤 다시 시도해 주세요."
      : raw

    if (!missingKey && quotaLike) {
      error =
        "Gemini API 사용 한도(쿼터)에 걸렸습니다. Google AI Studio/Cloud에서 결제·플랜·한도를 확인한 뒤 잠시 후 다시 시도해 주세요."
    } else if (!missingKey && raw.length > 800) {
      error =
        "분석 중 오류가 났습니다. 터미널(서버 로그)의 [api/analyze] 항목을 확인하거나, 잠시 후 다시 시도해 주세요."
    }

    return Response.json(
      {
        error,
        code: missingKey
          ? "AI_NOT_CONFIGURED"
          : quotaLike
            ? "AI_QUOTA_EXCEEDED"
            : "AI_ANALYSIS_FAILED",
      },
      { status }
    )
  }
}
