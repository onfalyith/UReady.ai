import type {
  CredibilityLabel,
  ExistenceStatus,
  SourceCitation,
  SourceVerificationItem,
  SourceVerificationReport,
} from "@/lib/types"

const cache = new Map<string, SourceVerificationItem>()

function getEnv(name: string) {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function getUrlHost(url: string) {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ""
  }
}

function credibilityFromUrl(url: string, httpStatus?: number): {
  label: CredibilityLabel
  score: number
  signals: string[]
} {
  const host = getUrlHost(url)
  const signals: string[] = []
  if (httpStatus) signals.push(`http:${httpStatus}`)
  if (host) signals.push(`host:${host}`)

  // MVP용 휴리스틱: 도메인 TLD 기반
  if (host.endsWith(".edu") || host.endsWith(".ac.kr") || host.endsWith(".gov")) {
    return { label: "high", score: 0.85, signals }
  }
  if (host.includes("wikipedia.org")) {
    return { label: "medium", score: 0.55, signals }
  }
  if (host) {
    return { label: "medium", score: 0.5, signals }
  }
  return { label: "unknown", score: 0.25, signals }
}

function unknownItem(citation: SourceCitation): SourceVerificationItem {
  const status: ExistenceStatus = "unknown"
  return {
    citation,
    existence: {
      status,
    },
    credibility: {
      label: "unknown",
      score: 0.2,
      signals: [],
      limitations: ["존재 검증 결과를 알 수 없습니다."],
    },
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms)
  })
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

function credibilityFromTavilyResults(results: any[]): {
  label: CredibilityLabel
  score: number
  signals: string[]
} {
  const top = results[0] as any
  const topUrl: string | undefined = typeof top?.url === "string" ? top.url : undefined
  const host = topUrl ? getUrlHost(topUrl) : ""
  const scoreRaw = typeof top?.score === "number" ? top.score : undefined

  const signals: string[] = []
  if (typeof scoreRaw === "number") signals.push(`tavily_score:${scoreRaw}`)
  if (host) signals.push(`tavily_host:${host}`)
  signals.push(`tavily_hits:${results.length}`)

  // URL 도메인 기반 휴리스틱을 재사용
  if (host.endsWith(".edu") || host.endsWith(".ac.kr") || host.endsWith(".gov")) {
    return { label: "high", score: 0.88, signals }
  }
  if (host.includes("wikipedia.org")) {
    return { label: "medium", score: 0.58, signals }
  }
  if (host) {
    const s = typeof scoreRaw === "number" ? Math.min(0.85, 0.35 + scoreRaw * 0.6) : 0.55
    return { label: "medium", score: s, signals }
  }
  return { label: "unknown", score: 0.3, signals }
}

async function verifyUnknownWithTavily(
  citation: SourceCitation
): Promise<SourceVerificationItem> {
  const tavilyKey = getEnv("TAVILY_API_KEY")
  if (!tavilyKey) return unknownItem(citation)

  const query = citation.raw?.toString().trim() ?? ""
  if (!query) return unknownItem(citation)

  const cacheKey = `tavily:${query.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const controller = new AbortController()

  try {
    const res = await withTimeout(
      fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tavilyKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: 5,
          topic: "general",
          include_answer: false,
        }),
      }),
      12000
    )

    if (!res.ok) {
      const item: SourceVerificationItem = {
        citation,
        existence: { status: "error", httpStatus: res.status },
        credibility: {
          label: "unknown",
          score: 0.2,
          signals: [],
          limitations: ["Tavily 요청 실패(응답 오류)."],
        },
      }
      cache.set(cacheKey, item)
      return item
    }

    const json = (await res.json().catch(() => null)) as any
    const results = Array.isArray(json?.results) ? json.results : []

    const status: ExistenceStatus = results.length > 0 ? "exists" : "not_found"
    const { label, score, signals } = credibilityFromTavilyResults(results)

    const item: SourceVerificationItem = {
      citation,
      existence: {
        status,
        httpStatus: res.status,
        note:
          status === "exists"
            ? "Tavily 검색 결과에서 관련 항목을 확인했습니다."
            : "Tavily 검색 결과가 없습니다.",
      },
      credibility: {
        label,
        score: status === "exists" ? score : Math.min(score, 0.4),
        signals,
        limitations:
          status === "exists"
            ? undefined
            : ["자동 검증에서 관련 결과를 찾지 못했습니다(일시적 검색 이슈 가능)."],
      },
      evidence: {
        topTitle: results[0]?.title ?? null,
        topUrl: results[0]?.url ?? null,
      },
    }

    cache.set(cacheKey, item)
    return item
  } catch {
    const item: SourceVerificationItem = {
      citation,
      existence: { status: "error" },
      credibility: {
        label: "unknown",
        score: 0.2,
        signals: [],
        limitations: ["Tavily 검색 요청이 실패했습니다(네트워크/타임아웃)."],
      },
    }
    cache.set(cacheKey, item)
    return item
  } finally {
    controller.abort()
  }
}

async function verifyUrl(url: string): Promise<SourceVerificationItem> {
  const cacheKey = `url:${url.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  let httpStatus: number | undefined
  let status: ExistenceStatus = "unknown"
  const limitations: string[] = []

  try {
    const controller = new AbortController()
    const res = await withTimeout(
      fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      }),
      8000
    )
    httpStatus = res.status

    if (res.status >= 200 && res.status < 400) status = "exists"
    else if (res.status === 404) status = "not_found"
    else status = "unknown"

    if (res.status === 403) {
      limitations.push("접근 제한(403)으로 존재를 확정하기 어렵습니다.")
    }
  } catch {
    // 일부 서버는 HEAD를 막고 GET만 허용할 수 있음
    try {
      const res = await withTimeout(fetch(url, { method: "GET", redirect: "follow" }), 8000)
      httpStatus = res.status
      if (res.status >= 200 && res.status < 400) status = "exists"
      else if (res.status === 404) status = "not_found"
      else status = "unknown"

      if (res.status === 403) {
        limitations.push("접근 제한(403)으로 존재를 확정하기 어렵습니다.")
      }
    } catch {
      status = "error"
      limitations.push("URL 요청 실패(네트워크/차단/타임아웃).")
    }
  }

  const { label, score, signals } = credibilityFromUrl(url, httpStatus)

  const item: SourceVerificationItem = {
    citation: { id: cacheKey, type: "url", raw: url, url },
    existence: {
      status,
      httpStatus,
      note: status === "exists" ? "HTTP 응답 OK" : undefined,
    },
    credibility: {
      label,
      score: status === "exists" ? score : Math.min(score, 0.4),
      signals,
      limitations: limitations.length ? limitations : undefined,
    },
  }

  cache.set(cacheKey, item)
  return item
}

async function verifyDoi(doi: string): Promise<SourceVerificationItem> {
  const cacheKey = `doi:${doi.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  let status: ExistenceStatus = "unknown"
  let httpStatus: number | undefined

  const signals: string[] = []
  const limitations: string[] = []

  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    const res = await withTimeout(fetch(url, { method: "GET" }), 10000)
    httpStatus = res.status

    if (res.status >= 200 && res.status < 300) {
      status = "exists"
      const json = (await res.json()) as any
      const message = json?.message ?? {}

      const journal =
        Array.isArray(message["container-title"]) && message["container-title"][0]
          ? message["container-title"][0]
          : undefined
      const year =
        message?.issued?.["date-parts"]?.[0]?.[0] ??
        message?.published?.["date-parts"]?.[0]?.[0]

      const citedBy = message?.["is-referenced-by-count"]

      if (journal) signals.push(`journal:${journal}`)
      if (typeof year === "number") signals.push(`year:${year}`)
      if (typeof citedBy === "number") signals.push(`citations:${citedBy}`)

      let label: CredibilityLabel = "medium"
      let score = 0.55
      if (typeof citedBy === "number") {
        if (citedBy >= 100) {
          label = "high"
          score = 0.9
        } else if (citedBy >= 20) {
          label = "medium"
          score = 0.65
        } else {
          label = "low"
          score = 0.45
        }
      } else {
        label = "medium"
        score = 0.6
      }

      const item: SourceVerificationItem = {
        citation: { id: cacheKey, type: "doi", raw: doi, doi },
        existence: {
          status,
          httpStatus,
          note: "Crossref 메타데이터 존재",
        },
        credibility: {
          label,
          score,
          signals,
          limitations: undefined,
        },
        evidence: {
          journal,
          year,
          citationsCount: citedBy ?? null,
        },
      }

      cache.set(cacheKey, item)
      return item
    }

    if (res.status === 404) status = "not_found"
    else status = "unknown"

    if (res.status === 503) limitations.push("Crossref 일시 장애/레이트리밋 가능성.")
  } catch {
    status = "error"
    limitations.push("Crossref 요청 실패(네트워크/타임아웃).")
  }

  const item: SourceVerificationItem = {
    citation: { id: cacheKey, type: "doi", raw: doi, doi },
    existence: { status, httpStatus },
    credibility: {
      label: "unknown",
      score: 0.25,
      signals,
      limitations: limitations.length ? limitations : undefined,
    },
  }
  cache.set(cacheKey, item)
  return item
}

export async function verifyCitationsExternally(
  citations: SourceCitation[]
): Promise<SourceVerificationReport> {
  const items: SourceVerificationItem[] = []

  // 병렬 처리(최대 10 정도로 제한)
  const list = citations.slice(0, 10)
  const results = await Promise.all(
    list.map(async (c) => {
      if (c.type === "url" && c.url) return verifyUrl(c.url)
      if (c.type === "doi" && c.doi) return verifyDoi(c.doi)
      if (c.type === "unknown") return verifyUnknownWithTavily(c)
      return unknownItem(c)
    })
  )

  items.push(...results)

  const existsCount = items.filter((i) => i.existence.status === "exists").length
  const notFoundCount = items.filter(
    (i) => i.existence.status === "not_found"
  ).length
  const unknownCount = items.filter((i) => i.existence.status === "unknown").length
  const errorCount = items.filter((i) => i.existence.status === "error").length

  let overall: SourceVerificationReport["overall"] = "warn"
  if (citations.length === 0) overall = "warn"
  else if (existsCount > 0) {
    overall = notFoundCount > 0 || errorCount > 0 ? "warn" : "pass"
  } else {
    // 전부 찾지 못함(또는 에러)
    overall = "block"
  }

  const summary =
    citations.length === 0
      ? "텍스트에서 URL/DOI 출처를 찾지 못했습니다. 자동 검증 없이 분석을 진행할 수 있습니다."
      : overall === "pass"
        ? "URL/DOI 출처를 외부에서 확인했습니다."
        : overall === "warn"
          ? "일부 출처는 확인되었지만, 일부는 검증이 불완전합니다."
          : "제공된 출처 후보가 외부에서 확인되지 않아 분석을 중단할 것을 권장합니다."

  const limitations: string[] = [
    "URL은 접근 가능 여부(robots/인증/차단)에 따라 확인 결과가 달라질 수 있습니다.",
    "Crossref는 DOI가 등록된 문서만 커버합니다.",
  ]
  if (unknownCount > 0 || errorCount > 0) {
    limitations.push("네트워크/타임아웃/레이트리밋으로 인해 확인이 누락될 수 있습니다.")
  }

  return {
    overall,
    summary,
    extractedCount: citations.length,
    items,
    limitations,
  }
}

