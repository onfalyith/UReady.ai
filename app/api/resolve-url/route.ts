import { z } from "zod"
import {
  extractPdfRateLimitResponse,
  rateLimitExtract,
} from "@/lib/rate-limit"
import { resolveEvidenceUrl } from "@/lib/url/resolve-evidence-url"
import { isPlaceholderEvidenceUrl } from "@/lib/uready/evidence-ui"

export const runtime = "nodejs"

const bodySchema = z.object({
  urls: z
    .array(z.string().max(2048))
    .min(1, "urls required")
    .max(8, "too many urls"),
  /** URL 문자열 키 → Serper 보조 질의용 제목 힌트 */
  titleHints: z.record(z.string()).optional(),
  /** URL 문자열 키 → 도메인 정합성 검사용 스니펫 */
  snippets: z.record(z.string()).optional(),
})

export async function POST(request: Request) {
  const limited = await rateLimitExtract(request)
  if (!limited.ok) {
    return extractPdfRateLimitResponse(limited.denied)
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다." }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    const msg =
      parsed.error.flatten().formErrors[0] ?? "유효하지 않은 입력입니다."
    return Response.json({ error: msg }, { status: 400 })
  }

  const rawUrls = parsed.data.urls
  const titleHints = parsed.data.titleHints ?? {}
  const snippets = parsed.data.snippets ?? {}

  const unique = [...new Set(rawUrls.map((u) => u.trim()))].filter(
    (u) => u.length > 0 && !isPlaceholderEvidenceUrl(u)
  )

  if (unique.length === 0) {
    return Response.json({ results: [] as const })
  }

  const results = await Promise.all(
    unique.map(async (inputUrl) => {
      const hint = titleHints[inputUrl]?.trim() || undefined
      const snippet = snippets[inputUrl]?.trim() || undefined
      const r = await resolveEvidenceUrl(inputUrl, {
        titleHint: hint,
        snippet,
      })
      if (r.ok) {
        return {
          inputUrl: r.inputUrl,
          ok: true as const,
          finalUrl: r.finalUrl,
          pageTitle: r.pageTitle,
          source: r.source,
          timingsMs: r.timingsMs,
        }
      }
      if (r.excludeFromEvidence) {
        return {
          inputUrl: r.inputUrl,
          ok: false as const,
          excludeFromEvidence: true as const,
          timingsMs: r.timingsMs,
        }
      }
      return {
        inputUrl: r.inputUrl,
        ok: false as const,
        excludeFromEvidence: false as const,
        reason: r.reason,
        timingsMs: r.timingsMs,
        googleSearchUrl: r.googleSearchUrl,
      }
    })
  )

  return Response.json({ results })
}
