import { z } from "zod"

/** evidence.stance — 모델 출력(한국어) + 레거시 영문 호환 */
export const evidenceStanceSchema = z.enum([
  "근거 확인",
  "근거 다름",
  "근거 부족",
])

export type EvidenceStance = z.infer<typeof evidenceStanceSchema>

/** 이슈별 출처·근거 신뢰도(UI에서 한국어 안내로 매핑) */
export const sourceReliabilitySchema = z.enum([
  "pass",
  "low_credibility",
  "unverified",
])

export type SourceReliability = z.infer<typeof sourceReliabilitySchema>

function pickString(
  row: Record<string, unknown>,
  keys: string[],
  fallback: string
): string {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return fallback
}

function normalizeStance(raw: unknown): EvidenceStance {
  const s = typeof raw === "string" ? raw.trim() : ""
  if (s === "근거 확인") return "근거 확인"
  if (s === "근거 다름" || s === "근거다름") return "근거 다름"
  if (s === "근거 부족" || s === "근거부족") return "근거 부족"
  const t = s.toLowerCase()
  if (t === "supports" || t === "support") return "근거 확인"
  if (t === "contradicts" || t === "contradict") return "근거 다름"
  if (t === "insufficient" || t === "insufficient_evidence") {
    return "근거 부족"
  }
  return "근거 부족"
}

function normalizeSourceReliability(raw: unknown): SourceReliability {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (s === "pass" || s === "ok" || s === "패스") return "pass"
  if (
    s === "low_credibility" ||
    s === "lowcredibility" ||
    s.includes("신뢰도가 낮")
  ) {
    return "low_credibility"
  }
  if (
    s === "unverified" ||
    s === "미확인" ||
    s.includes("확인되지 않")
  ) {
    return "unverified"
  }
  return "pass"
}

function coerceValidUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : ""
  if (!s) return "https://example.com"
  try {
    new URL(s)
    return s
  } catch {
    return "https://example.com"
  }
}

const presentationEvidenceStrictSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  stance: evidenceStanceSchema,
})

export type PresentationEvidence = z.infer<typeof presentationEvidenceStrictSchema>

/**
 * 모델이 camelCase/snake_case를 섞거나 title 등을 빼는 경우가 있어
 * 느슨히 파싱한 뒤 UI 스키마 형태로 맞춥니다.
 */
export const evidenceSchema = z
  .object({
    title: z.string().optional(),
    Title: z.string().optional(),
    source_title: z.string().optional(),
    headline: z.string().optional(),
    name: z.string().optional(),
    url: z.string().optional(),
    link: z.string().optional(),
    href: z.string().optional(),
    snippet: z.string().optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    stance: z.union([evidenceStanceSchema, z.string()]).optional(),
  })
  .passthrough()
  .transform((e) => {
    const row = e as Record<string, unknown>
    const title = pickString(
      row,
      ["title", "Title", "source_title", "headline", "name"],
      "검색·출처"
    )
    const url = coerceValidUrl(
      row.url ?? row.link ?? row.href ?? row.URL
    )
    const snippet = pickString(
      row,
      ["snippet", "description", "summary", "text"],
      "—"
    )
    return {
      title,
      url,
      snippet,
      stance: normalizeStance(row.stance),
    }
  })
  .pipe(presentationEvidenceStrictSchema)

const presentationIssueStrictSchema = z.object({
  location: z.string(),
  originalText: z.string(),
  logicalWeakness: z.string(),
  counterArgument: z.string(),
  improvementQuestion: z.string(),
  sourceReliability: sourceReliabilitySchema,
  evidence: z.array(presentationEvidenceStrictSchema).min(1),
})

export type PresentationIssue = z.infer<typeof presentationIssueStrictSchema>

export const presentationIssueSchema = z
  .object({
    location: z.string().optional(),
    Location: z.string().optional(),
    originalText: z.string().optional(),
    original_text: z.string().optional(),
    quote: z.string().optional(),
    excerpt: z.string().optional(),
    text: z.string().optional(),
    logicalWeakness: z.string().optional(),
    logical_weakness: z.string().optional(),
    counterArgument: z.string().optional(),
    counter_argument: z.string().optional(),
    improvementQuestion: z.string().optional(),
    improvement_question: z.string().optional(),
    sourceReliability: z.string().optional(),
    source_reliability: z.string().optional(),
    evidence: z.array(z.unknown()).optional(),
  })
  .passthrough()
  .transform((raw) => {
    const row = raw as Record<string, unknown>
    const originalText = pickString(
      row,
      [
        "originalText",
        "original_text",
        "quote",
        "excerpt",
        "text",
        "sourceText",
        "source_text",
      ],
      ""
    )
    const evidenceIn = Array.isArray(row.evidence) ? row.evidence : []
    const evidence = evidenceIn
      .map((item) => {
        const r = evidenceSchema.safeParse(item)
        return r.success ? r.data : null
      })
      .filter((x): x is PresentationEvidence => x != null)

    const filledEvidence: PresentationEvidence[] =
      evidence.length > 0
        ? evidence
        : [
            {
              title: "근거 없음",
              url: "https://example.com",
              snippet: "모델이 evidence를 비우거나 파싱하지 못했습니다.",
              stance: "근거 부족",
            },
          ]

    const sourceReliability = normalizeSourceReliability(
      row.sourceReliability ?? row.source_reliability
    )

    return {
      location: pickString(row, ["location", "Location"], "—"),
      originalText: originalText || "(원문 인용 없음)",
      logicalWeakness: pickString(
        row,
        ["logicalWeakness", "logical_weakness"],
        "—"
      ),
      counterArgument: pickString(
        row,
        ["counterArgument", "counter_argument"],
        "—"
      ),
      improvementQuestion: pickString(
        row,
        ["improvementQuestion", "improvement_question"],
        "—"
      ),
      sourceReliability,
      evidence: filledEvidence,
    }
  })
  .pipe(presentationIssueStrictSchema)

const presentationAnalysisStrictSchema = z.object({
  issues: z.array(presentationIssueStrictSchema),
})

export type PresentationAnalysis = z.infer<typeof presentationAnalysisStrictSchema>

/** `/api/analyze` 응답 — 모델 입력 길이(잘림)·구간 분할 메타 */
export const materialMetaSchema = z.object({
  charLengthOriginal: z.number().int().nonnegative(),
  charLengthSentToModel: z.number().int().nonnegative(),
  truncatedForModel: z.boolean(),
  maxChars: z.number().int().positive(),
  usedChunkedAnalysis: z.boolean().optional(),
  chunkCount: z.number().int().positive().optional(),
})

export type AnalysisMaterialMeta = z.infer<typeof materialMetaSchema>

/** 루트가 배열이면 issues 로 감쌈 (모델이 [이슈…] 만 반환하는 경우) */
function normalizeAnalysisRoot(val: unknown): unknown {
  if (Array.isArray(val)) return { issues: val }
  return val
}

const presentationAnalysisLooseSchema = z
  .object({
    issues: z.array(z.unknown()).optional(),
  })
  .passthrough()
  .transform((o) => {
    const list = Array.isArray(o.issues) ? o.issues : []
    const issues = list
      .map((item) => {
        const r = presentationIssueSchema.safeParse(item)
        return r.success ? r.data : null
      })
      .filter((x): x is PresentationIssue => x != null)
    return { issues }
  })
  .pipe(presentationAnalysisStrictSchema)

export const presentationAnalysisSchema = z.preprocess(
  normalizeAnalysisRoot,
  presentationAnalysisLooseSchema
)
