import {
  materialMetaSchema,
  presentationAnalysisSchema,
  type AnalysisMaterialMeta,
  type PresentationAnalysis,
} from "@/lib/ai/schema"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export async function analyzePresentationText(
  text: string,
  opts?: {
    userFocusNotes?: string
    dualSourceMode?: boolean
    deepInspectionMode?: boolean
  }
): Promise<
  | {
      ok: true
      data: PresentationAnalysis
      materialMeta: AnalysisMaterialMeta | undefined
    }
  | { ok: false; message: string }
> {
  const focus = opts?.userFocusNotes?.trim()
  const dual = opts?.dualSourceMode === true
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      ...(focus ? { userFocusNotes: focus } : {}),
      ...(dual ? { dualSourceMode: true } : {}),
      ...(opts?.deepInspectionMode === true
        ? { deepInspectionMode: true }
        : {}),
    }),
  })

  const raw: unknown = await res.json().catch(() => ({}))

  if (!res.ok) {
    const o = raw as {
      error?: unknown
      retryAfterSeconds?: unknown
      code?: unknown
    }
    let base =
      typeof o.error === "string"
        ? o.error
        : "분석 요청에 실패했습니다."
    if (
      res.status === 503 &&
      base === "분석 요청에 실패했습니다."
    ) {
      base =
        "Gemini API 키가 없거나 서버 설정 오류입니다. .env.local에 GOOGLE_GENERATIVE_AI_API_KEY를 넣고 개발 서버를 재시작해 주세요."
    }
    const retry =
      typeof o.retryAfterSeconds === "number" && o.retryAfterSeconds > 0
        ? ` (약 ${o.retryAfterSeconds}초 후 재시도 가능)`
        : ""
    return { ok: false, message: base + retry }
  }

  const obj = isRecord(raw) ? raw : {}
  const parsed = presentationAnalysisSchema.safeParse({ issues: obj.issues })
  if (!parsed.success) {
    return { ok: false, message: "분석 응답 형식이 올바르지 않습니다." }
  }

  const metaParsed = materialMetaSchema.safeParse(obj.materialMeta)
  const materialMeta = metaParsed.success ? metaParsed.data : undefined

  return { ok: true, data: parsed.data, materialMeta }
}
