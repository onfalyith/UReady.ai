import { z } from "zod"
import {
  analyzeRateLimitResponse,
  getRequestFingerprint,
  rateLimitAnalyze,
} from "@/lib/rate-limit/upstash"
import { runPresentationAnalysis } from "@/lib/ai/analyze"
import {
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

  const { text } = parsed.data
  const trimmed = text.trim()

  if (countSignificantChars(trimmed) < MIN_ANALYSIS_SIGNIFICANT_CHARS) {
    return Response.json(
      {
        error: `분석할 텍스트가 너무 짧습니다. 공백 제외 ${MIN_ANALYSIS_SIGNIFICANT_CHARS}자 이상 입력해 주세요.`,
      },
      { status: 400 }
    )
  }

  try {
    const { analysis, providerMetadata, groundingSteps } =
      await runPresentationAnalysis(trimmed)

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

    const responseBody: PresentationAnalysis = {
      issues: validated.issues,
    }

    return Response.json(responseBody satisfies PresentationAnalysis)
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
