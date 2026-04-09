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

  const bodyText = await res.text()
  let raw: unknown = {}
  if (bodyText.trim()) {
    try {
      raw = JSON.parse(bodyText) as unknown
    } catch {
      raw = {
        error: `서버가 JSON이 아닌 응답을 돌려줬습니다. (${bodyText.slice(0, 280)}${bodyText.length > 280 ? "…" : ""})`,
      }
    }
  }

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
    const codeStr =
      typeof o.code === "string" && o.code.trim().length > 0
        ? ` (${o.code})`
        : ""
    if (
      (res.status === 504 || res.status === 502) &&
      !(typeof o.error === "string" && o.error.trim().length > 0)
    ) {
      base =
        "서버 응답 시간이 초과되었습니다. Vercel 무료 플랜은 함수당 약 60초 한도이며, 심층 점검·긴 문서는 초과할 수 있습니다. 심층 점검을 끄고 다시 시도하거나 문서를 짧게 하거나, Vercel Pro(최대 300초)를 검토해 주세요."
    }
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
    return { ok: false, message: base + codeStr + retry }
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
