import "server-only"

import {
  fetchPublicUrlHtmlExcerpt,
  resolvePublicUrl,
} from "@/lib/url/resolve-public-url"

const WAYBACK_TIMEOUT_MS = 10_000
const SERPER_TIMEOUT_MS = 12_000

export type EvidenceResolveTimingsMs = {
  /** 1단계: 원문 URL 직접 GET */
  direct: number
  /** 2단계: Internet Archive available + (성공 시) 스냅샷 페이지 GET */
  wayback?: number
  /** 3단계: Serper 웹 검색 (키 있을 때만) */
  search?: number
  /** 전체 실패 후: 루트 도메인·내용 정합성 게이트 */
  domainGate?: number
  total: number
}

export type ResolveEvidenceUrlResult =
  | {
      ok: true
      inputUrl: string
      finalUrl: string
      pageTitle: string | null
      /** 어떤 경로로 복구했는지 */
      source: "fetch" | "wayback" | "search" | "domain_home"
      timingsMs: EvidenceResolveTimingsMs
    }
  | {
      ok: false
      inputUrl: string
      timingsMs: EvidenceResolveTimingsMs
      /** true면 출처 UI에 넣지 않음(사유·링크 미표시) */
      excludeFromEvidence: true
    }
  | {
      ok: false
      inputUrl: string
      timingsMs: EvidenceResolveTimingsMs
      excludeFromEvidence: false
      reason: string
      googleSearchUrl: string
    }

export function buildGoogleSearchUrlForLink(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

type WaybackApiResponse = {
  archived_snapshots?: {
    closest?: {
      available?: boolean
      url?: string
      status?: string
    }
  }
}

async function getWaybackClosestPageUrl(originalUrl: string): Promise<string | null> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(originalUrl)}`
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), WAYBACK_TIMEOUT_MS)
  try {
    const res = await fetch(api, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return null
    const data = (await res.json()) as WaybackApiResponse
    const u = data.archived_snapshots?.closest?.url
    if (typeof u === "string" && /^https?:\/\//i.test(u)) return u
    return null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

type SerperOrganic = { title?: string; link?: string; snippet?: string }

function pickSerperResult(
  inputUrl: string,
  organic: SerperOrganic[]
): SerperOrganic | null {
  if (!organic.length) return null
  let inputHost: string
  let inputPath: string
  try {
    const u = new URL(inputUrl)
    inputHost = u.hostname.replace(/^www\./i, "").toLowerCase()
    inputPath = u.pathname || "/"
  } catch {
    return organic[0] ?? null
  }

  const normHost = (h: string) => h.replace(/^www\./i, "").toLowerCase()

  const samePath = organic.find((o) => {
    if (!o.link) return false
    try {
      const u = new URL(o.link)
      return (
        normHost(u.hostname) === inputHost && u.pathname === inputPath
      )
    } catch {
      return false
    }
  })
  if (samePath?.link) return samePath

  const sameHost = organic.find((o) => {
    if (!o.link) return false
    try {
      return normHost(new URL(o.link).hostname) === inputHost
    } catch {
      return false
    }
  })
  if (sameHost?.link) return sameHost

  return organic[0] ?? null
}

async function serperSearchForUrl(
  inputUrl: string,
  titleHint?: string
): Promise<{ link: string; title: string } | null> {
  const key = process.env.SERPER_API_KEY?.trim()
  if (!key) return null

  let host = ""
  try {
    host = new URL(inputUrl).hostname.replace(/^www\./i, "")
  } catch {
    return null
  }

  const q = titleHint?.trim()
    ? `${titleHint.trim().slice(0, 120)} site:${host}`
    : `"${inputUrl}"`

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), SERPER_TIMEOUT_MS)
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": key,
      },
      body: JSON.stringify({ q, num: 10 }),
      signal: ac.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { organic?: SerperOrganic[] }
    const organic = data.organic ?? []
    const picked = pickSerperResult(inputUrl, organic)
    if (!picked?.link) return null
    const title =
      typeof picked.title === "string" && picked.title.trim()
        ? picked.title.trim()
        : host
    return { link: picked.link, title }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function logResolvePerf(inputUrl: string, result: ResolveEvidenceUrlResult) {
  if (process.env.RESOLVE_URL_LOG_MS?.trim().toLowerCase() !== "true") return
  const payload =
    result.ok === true
      ? {
          ok: true,
          source: result.source,
          timingsMs: result.timingsMs,
        }
      : "excludeFromEvidence" in result && result.excludeFromEvidence
        ? { ok: false, excluded: true, timingsMs: result.timingsMs }
        : {
            ok: false,
            timingsMs: result.timingsMs,
          }
  console.info("[resolve-evidence-url]", inputUrl.slice(0, 120), payload)
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-–—]/g, " ")
    .trim()
}

/** 루트 HTML에 스니펫·제목 힌트가 실제로 등장하는지(느슨한 키워드 매칭) */
function verifySnippetMatchesHtml(
  html: string,
  snippet?: string,
  titleHint?: string
): boolean {
  const h = normalizeForMatch(html)
  if (h.length < 30) return false

  const th = titleHint?.trim()
  if (th && th.length >= 4) {
    const nt = normalizeForMatch(th).slice(0, 80)
    if (nt.length >= 4 && h.includes(nt)) return true
  }

  const sn = normalizeForMatch(snippet || "")
  if (sn.length < 8) return false

  const words = sn
    .split(/\s+/)
    .map((w) => w.replace(/[^0-9A-Za-z\uAC00-\uD7A3]/g, ""))
    .filter((w) => w.length > 1)
    .slice(0, 12)

  if (words.length < 2) return false

  let hits = 0
  for (const w of words) {
    if (h.includes(w.toLowerCase())) hits++
  }
  const need = Math.max(2, Math.min(4, Math.ceil(words.length * 0.35)))
  return hits >= need
}

/** site: 도메인 + 스니펫 키워드로 동일 사이트 내 근거 후보가 있는지 */
async function serperSiteContentMatch(
  host: string,
  snippet?: string,
  titleHint?: string
): Promise<{ link: string; title: string } | null> {
  const key = process.env.SERPER_API_KEY?.trim()
  if (!key) return null

  const parts = [titleHint?.trim(), snippet?.trim()].filter(Boolean).join(" ")
  const q = `${parts.slice(0, 140)} site:${host}`

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), SERPER_TIMEOUT_MS)
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": key,
      },
      body: JSON.stringify({ q, num: 8 }),
      signal: ac.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { organic?: SerperOrganic[] }
    const organic = data.organic ?? []
    const normHost = (x: string) => x.replace(/^www\./i, "").toLowerCase()
    const target = normHost(host)

    for (const o of organic) {
      if (!o.link) continue
      try {
        if (normHost(new URL(o.link).hostname) !== target) continue
        const title =
          typeof o.title === "string" && o.title.trim()
            ? o.title.trim()
            : host
        return { link: o.link, title }
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * 직접·Wayback·Serper가 모두 실패한 뒤: 루트 도메인 생존 여부 + 스니펫 정합성.
 * - 루트 실패 → 출처 제외
 * - 루트 성공이나 스니펫을 도메인에서 확인 못함 → 출처 제외
 * - 루트 HTML 또는 site: 검색으로 정합 확인 시 홈/검색 링크로 복구
 */
async function tryFailureDomainGate(
  inputUrl: string,
  opts: { titleHint?: string; snippet?: string }
): Promise<
  | { kind: "exclude" }
  | { kind: "recover"; finalUrl: string; pageTitle: string | null; source: "domain_home" | "search" }
> {
  let origin: string
  try {
    origin = new URL(inputUrl.trim()).origin + "/"
  } catch {
    return { kind: "exclude" }
  }

  const root = await resolvePublicUrl(origin)
  if (!root.ok) {
    return { kind: "exclude" }
  }

  const snippet = opts.snippet?.trim()
  const titleHint = opts.titleHint?.trim()

  if (!snippet || snippet.length < 8) {
    return { kind: "exclude" }
  }

  const html = await fetchPublicUrlHtmlExcerpt(root.finalUrl)
  if (html && verifySnippetMatchesHtml(html, snippet, titleHint)) {
    return {
      kind: "recover",
      finalUrl: root.finalUrl,
      pageTitle: root.pageTitle,
      source: "domain_home",
    }
  }

  let host = ""
  try {
    host = new URL(inputUrl).hostname.replace(/^www\./i, "")
  } catch {
    return { kind: "exclude" }
  }

  const serp = await serperSiteContentMatch(host, snippet, titleHint)
  if (serp) {
    return {
      kind: "recover",
      finalUrl: serp.link,
      pageTitle: serp.title,
      source: "search",
    }
  }

  return { kind: "exclude" }
}

/**
 * 1) 직접 fetch → 2) Wayback 스냅샷 → 3) Serper( SERPER_API_KEY 있을 때만 )
 * 4) 전부 실패 시 루트 도메인 + 스니펫 정합성 게이트(미충족 시 출처에서 제외)
 */
export async function resolveEvidenceUrl(
  inputUrl: string,
  options?: { titleHint?: string; snippet?: string }
): Promise<ResolveEvidenceUrlResult> {
  const t0 = Date.now()
  const timings: EvidenceResolveTimingsMs = {
    direct: 0,
    total: 0,
  }

  const tDirect = Date.now()
  const direct = await resolvePublicUrl(inputUrl)
  timings.direct = Date.now() - tDirect

  if (direct.ok) {
    timings.total = Date.now() - t0
    const out: ResolveEvidenceUrlResult = {
      ok: true,
      inputUrl: direct.inputUrl,
      finalUrl: direct.finalUrl,
      pageTitle: direct.pageTitle,
      source: "fetch",
      timingsMs: timings,
    }
    logResolvePerf(inputUrl, out)
    return out
  }

  const titleHint = options?.titleHint

  const tWbStart = Date.now()
  const waybackUrl = await getWaybackClosestPageUrl(inputUrl)
  timings.wayback = Date.now() - tWbStart

  if (waybackUrl) {
    const tSnap = Date.now()
    const snap = await resolvePublicUrl(waybackUrl)
    timings.wayback += Date.now() - tSnap
    timings.total = Date.now() - t0

    const out: ResolveEvidenceUrlResult = {
      ok: true,
      inputUrl: direct.inputUrl,
      finalUrl: waybackUrl,
      pageTitle: snap.ok ? snap.pageTitle : null,
      source: "wayback",
      timingsMs: timings,
    }
    logResolvePerf(inputUrl, out)
    return out
  }

  const tSe = Date.now()
  const serp = await serperSearchForUrl(inputUrl, titleHint)
  const searchMs = Date.now() - tSe
  if (serp) {
    timings.search = searchMs
    timings.total = Date.now() - t0
    const out: ResolveEvidenceUrlResult = {
      ok: true,
      inputUrl: direct.inputUrl,
      finalUrl: serp.link,
      pageTitle: serp.title,
      source: "search",
      timingsMs: timings,
    }
    logResolvePerf(inputUrl, out)
    return out
  }

  timings.search = searchMs

  const tGate = Date.now()
  const gate = await tryFailureDomainGate(inputUrl, {
    titleHint: options?.titleHint,
    snippet: options?.snippet,
  })
  timings.domainGate = Date.now() - tGate
  timings.total = Date.now() - t0

  if (gate.kind === "exclude") {
    const out: ResolveEvidenceUrlResult = {
      ok: false,
      inputUrl: direct.inputUrl,
      excludeFromEvidence: true,
      timingsMs: timings,
    }
    logResolvePerf(inputUrl, out)
    return out
  }

  const out: ResolveEvidenceUrlResult = {
    ok: true,
    inputUrl: direct.inputUrl,
    finalUrl: gate.finalUrl,
    pageTitle: gate.pageTitle,
    source: gate.source,
    timingsMs: timings,
  }
  logResolvePerf(inputUrl, out)
  return out
}
