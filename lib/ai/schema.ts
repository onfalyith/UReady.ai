import { z } from "zod"

/** evidence.stance — 허용 값만 */
export const evidenceStanceSchema = z.enum([
  "supports",
  "contradicts",
  "insufficient",
])

export type EvidenceStance = z.infer<typeof evidenceStanceSchema>

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
  const t = typeof raw === "string" ? raw.toLowerCase().trim() : ""
  if (t === "supports" || t === "support") return "supports"
  if (t === "contradicts" || t === "contradict") return "contradicts"
  if (t === "insufficient" || t === "insufficient_evidence") {
    return "insufficient"
  }
  return "insufficient"
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
              stance: "insufficient",
            },
          ]

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
      evidence: filledEvidence,
    }
  })
  .pipe(presentationIssueStrictSchema)

const presentationAnalysisStrictSchema = z.object({
  issues: z.array(presentationIssueStrictSchema),
})

export type PresentationAnalysis = z.infer<typeof presentationAnalysisStrictSchema>

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
