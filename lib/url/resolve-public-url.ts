import "server-only"

import dns from "node:dns/promises"
import { isIPv4, isIPv6 } from "node:net"

const FETCH_TIMEOUT_MS = 12_000
const MAX_HTML_BYTES = 512 * 1024

function isPrivateOrLocalIp(ip: string): boolean {
  if (isIPv4(ip)) {
    if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168."))
      return true
    if (ip.startsWith("169.254.")) return true
    const m = /^172\.(\d+)\./.exec(ip)
    if (m) {
      const n = Number(m[1])
      if (n >= 16 && n <= 31) return true
    }
    if (ip === "0.0.0.0") return true
    return false
  }
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower === "::1") return true
    if (lower.startsWith("::ffff:127.")) return true
    if (lower.startsWith("::ffff:10.")) return true
    if (lower.startsWith("::ffff:192.168.")) return true
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true
    if (lower.startsWith("fe80:")) return true
  }
  return false
}

async function assertPublicUrlHostname(hostname: string): Promise<void> {
  const h = hostname.toLowerCase()
  if (h === "localhost" || h === "localhost.localdomain") {
    throw new Error("BLOCKED_HOST")
  }
  if (isIPv4(h) || isIPv6(h)) {
    if (isPrivateOrLocalIp(h)) throw new Error("BLOCKED_IP")
    return
  }

  const lookups = await Promise.allSettled([
    dns.lookup(h, { family: 4 }),
    dns.lookup(h, { family: 6 }),
  ])
  for (const r of lookups) {
    if (r.status === "fulfilled" && isPrivateOrLocalIp(r.value.address)) {
      throw new Error("BLOCKED_DNS")
    }
  }
}

function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ""
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ""
    })
    .trim()
}

function extractTitleFromHtml(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!m?.[1]) return null
  const raw = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (!raw) return null
  const t = decodeBasicHtmlEntities(raw)
  return t.length > 0 ? t.slice(0, 500) : null
}

export type ResolvePublicUrlResult =
  | {
      ok: true
      inputUrl: string
      finalUrl: string
      /** 새 창에서 열릴 때와 동일한 출처 기준으로 맞춘 페이지 제목(없으면 null) */
      pageTitle: string | null
    }
  | {
      ok: false
      inputUrl: string
      /** 새 창에서 열리지 않거나 확인 불가일 때 사용자에게 보이는 한국어 사유 */
      reason: string
    }

function koreanReasonFromError(err: unknown, status?: number): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = String((err as { message: unknown }).message)
    if (m === "BLOCKED_HOST" || m === "BLOCKED_IP" || m === "BLOCKED_DNS") {
      return "내부·로컬 주소로의 연결은 지원하지 않습니다."
    }
  }
  if (status === 403 || status === 401) {
    return "해당 사이트에서 접근을 허용하지 않아 페이지를 열 수 없습니다."
  }
  if (status === 404) return "페이지를 찾을 수 없습니다 (404)."
  if (status === 410) return "페이지가 삭제되었습니다."
  if (status && status >= 500) {
    return "서버 오류로 페이지를 불러올 수 없습니다."
  }
  if (err instanceof Error) {
    if (/timeout|aborted|AbortError/i.test(err.name + err.message)) {
      return "연결 시간이 초과되었거나 응답이 없습니다."
    }
    if (/certificate|SSL|TLS|UNABLE_TO_VERIFY/i.test(err.message)) {
      return "보안 인증서 문제로 연결할 수 없습니다."
    }
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ENETUNREACH/i.test(err.message)) {
      return "주소에 연결할 수 없습니다. 링크가 만료되었거나 네트워크를 확인해 주세요."
    }
  }
  return "링크를 열 수 없습니다. 주소가 올바른지 확인해 주세요."
}

/**
 * 서버에서 GET으로 따라가며 최종 URL과 HTML title을 확인합니다.
 * 브라우저 새 탭과 동일한 제목을 맞추기 위한 용도이며, 일부 사이트는 봇 차단으로 실패할 수 있습니다.
 */
export async function resolvePublicUrl(inputUrl: string): Promise<ResolvePublicUrlResult> {
  let u: URL
  try {
    u = new URL(inputUrl.trim())
  } catch {
    return {
      ok: false,
      inputUrl: inputUrl,
      reason: "올바른 http(s) 주소가 아닙니다.",
    }
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return {
      ok: false,
      inputUrl: inputUrl,
      reason: "http(s) 링크만 확인할 수 있습니다.",
    }
  }

  try {
    await assertPublicUrlHostname(u.hostname)
  } catch {
    return {
      ok: false,
      inputUrl: inputUrl,
      reason: "내부·로컬 주소로의 연결은 지원하지 않습니다.",
    }
  }

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(u.toString(), {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "UReadyEvidenceBot/1.0 (link verification; +https://uready.ai)",
      },
    })

    const finalUrl = res.url || u.toString()

    if (!res.ok) {
      return {
        ok: false,
        inputUrl: inputUrl,
        reason: koreanReasonFromError(undefined, res.status),
      }
    }

    const ct = res.headers.get("content-type") ?? ""
    const isHtml =
      ct.includes("text/html") ||
      ct.includes("application/xhtml") ||
      finalUrl === u.toString()

    if (!isHtml) {
      return {
        ok: true,
        inputUrl: inputUrl,
        finalUrl,
        pageTitle: null,
      }
    }

    const reader = res.body?.getReader()
    if (!reader) {
      return {
        ok: true,
        inputUrl: inputUrl,
        finalUrl,
        pageTitle: null,
      }
    }

    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.length
      }
    }
    reader.releaseLock()

    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)))
    const html = buf.toString("utf8", 0, Math.min(buf.length, MAX_HTML_BYTES))
    const pageTitle = extractTitleFromHtml(html)

    return {
      ok: true,
      inputUrl: inputUrl,
      finalUrl,
      pageTitle,
    }
  } catch (e) {
    return {
      ok: false,
      inputUrl: inputUrl,
      reason: koreanReasonFromError(e),
    }
  } finally {
    clearTimeout(t)
  }
}

const HTML_EXCERPT_MAX_BYTES = 256 * 1024

/**
 * 동일한 안전 검사로 HTML 본문 앞부분만 읽습니다. 출처 스니펫과의 정합성 확인용.
 */
export async function fetchPublicUrlHtmlExcerpt(
  inputUrl: string
): Promise<string | null> {
  let u: URL
  try {
    u = new URL(inputUrl.trim())
  } catch {
    return null
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return null

  try {
    await assertPublicUrlHostname(u.hostname)
  } catch {
    return null
  }

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(u.toString(), {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "UReadyEvidenceBot/1.0 (link verification; +https://uready.ai)",
      },
    })

    if (!res.ok) return null

    const ct = res.headers.get("content-type") ?? ""
    if (
      !ct.includes("text/html") &&
      !ct.includes("application/xhtml") &&
      !ct.includes("application/xml")
    ) {
      return null
    }

    const reader = res.body?.getReader()
    if (!reader) return null

    const chunks: Uint8Array[] = []
    let total = 0
    while (total < HTML_EXCERPT_MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.length
      }
    }
    reader.releaseLock()

    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)))
    return buf.toString("utf8", 0, Math.min(buf.length, HTML_EXCERPT_MAX_BYTES))
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
