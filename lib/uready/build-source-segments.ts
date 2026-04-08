import type { PresentationIssue } from "@/types/analysis"

export type SourceSegment =
  | { type: "text"; content: string }
  | { type: "mark"; content: string; issueIndices: number[] }

function sameIssueSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y)
  const sb = [...b].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

/** PDF·웹에서 흔한 공백을 일반 공백으로(문자 수 동일 → 원문 인덱스 유지) */
function normalizeSpacesForIndexPreserve(s: string): string {
  return s
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ")
    .replace(/\u2009/g, " ")
}

/**
 * 모델 인용과 PDF 추출본에서 하이픈·대시 문자가 다르게 나오는 경우 대비(1:1 치환).
 */
function normalizeDashVariantsForIndexPreserve(s: string): string {
  let t = s
  t = t.replace(/\u2010/g, "-") // hyphen
  t = t.replace(/\u2011/g, "-") // non-breaking hyphen
  t = t.replace(/\u2012/g, "-") // figure dash
  t = t.replace(/\u2013/g, "-") // en dash
  t = t.replace(/\u2014/g, "-") // em dash
  t = t.replace(/\u2212/g, "-") // minus
  return t
}

/** 매칭용: 공백·대시류 정규화를 한 번에 */
function normalizeForMatch(s: string): string {
  return normalizeDashVariantsForIndexPreserve(normalizeSpacesForIndexPreserve(s))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 모델 인용은 한 줄·스페이스 위주인데, PDF 추출본은 줄바꿈·다중 공백이 섞이는 경우가 많음.
 * 토큰(공백으로 구분된 연속 덩어리) 사이에는 임의의 공백(\s+)을 허용해 위치를 찾는다.
 */
function findFlexibleWhitespaceTokenRanges(
  source: string,
  normalizedQuote: string
): [number, number][] {
  const raw = normalizedQuote.trim()
  if (raw.length < 2) return []
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length < 2) return []

  let re: RegExp
  try {
    re = new RegExp(tokens.map(escapeRegExp).join("\\s+"), "gu")
  } catch {
    return []
  }

  const ranges: [number, number][] = []
  let m: RegExpExecArray | null
  re.lastIndex = 0
  while ((m = re.exec(source)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
    if (m[0].length === 0) re.lastIndex++
  }
  return ranges
}

/** 인용 끝/앞의 문장부호·괄호만 다를 때 보조 매칭 */
function quoteVariantsForEnds(raw: string): string[] {
  const out = new Set<string>()
  out.add(raw)
  const trimmed = raw.replace(/[.。…!?]+$/u, "").trim()
  if (trimmed.length >= 2) out.add(trimmed)
  const noOpen = raw.replace(/^[「(（【『]+/u, "").trim()
  if (noOpen.length >= 2) out.add(noOpen)
  return [...out]
}

/** 원문에서 인용구가 나타나는 구간(여러 변형 순차 시도) */
function findMatchRanges(source: string, quote: string): [number, number][] {
  const src = normalizeForMatch(source)
  const raw = normalizeForMatch(quote).trim()
  if (raw.length < 2) return []

  const baseVariants = [
    raw,
    raw.replace(/\r\n/g, "\n"),
    raw.replace(/\n/g, " "),
    raw.replace(/\s+/g, " "),
    ...quoteVariantsForEnds(raw),
  ]

  const candidates = Array.from(
    new Set(baseVariants.filter((s) => s.length >= 2))
  )

  const ranges: [number, number][] = []
  const seen = new Set<string>()

  const push = (i: number, j: number) => {
    const key = `${i}:${j}`
    if (!seen.has(key)) {
      seen.add(key)
      ranges.push([i, j])
    }
  }

  for (const t of candidates) {
    let pos = 0
    while (true) {
      const i = src.indexOf(t, pos)
      if (i === -1) break
      push(i, i + t.length)
      pos = i + 1
    }
  }

  for (const variant of candidates) {
    for (const [a, b] of findFlexibleWhitespaceTokenRanges(src, variant)) {
      push(a, b)
    }
  }

  return ranges
}

/**
 * 제출 원문을 일반 텍스트 / 이슈별 하이라이트 구간으로 나눕니다.
 * 겹치는 구간은 issueIndices에 모두 담습니다.
 */
export function buildSourceSegments(
  source: string,
  issues: PresentationIssue[],
  options?: { onlyIssueIndices?: ReadonlySet<number> }
): SourceSegment[] {
  const onlyIssueIndices = options?.onlyIssueIndices
  const n = source.length
  if (n === 0) return []

  const perChar: number[][] = Array.from({ length: n }, () => [])

  issues.forEach((issue, issueIndex) => {
    if (onlyIssueIndices != null && !onlyIssueIndices.has(issueIndex)) return
    const q = issue.originalText?.trim() ?? ""
    if (q.length < 2) return
    if (q === "—" || q === "-" || q === "–" || q === "(원문 인용 없음)") return

    const ranges = findMatchRanges(source, issue.originalText ?? "")
    for (const [a, b] of ranges) {
      const end = Math.min(b, n)
      for (let k = Math.max(0, a); k < end; k++) {
        if (!perChar[k].includes(issueIndex)) perChar[k].push(issueIndex)
      }
    }
  })

  const segments: SourceSegment[] = []
  let i = 0
  while (i < n) {
    const cur = perChar[i]
    let j = i + 1
    while (j < n && sameIssueSet(perChar[j], cur)) j++

    const slice = source.slice(i, j)
    if (cur.length === 0) {
      segments.push({ type: "text", content: slice })
    } else {
      segments.push({
        type: "mark",
        content: slice,
        issueIndices: [...cur].sort((a, b) => a - b),
      })
    }
    i = j
  }

  return segments
}

/**
 * 브라우저 pdf.js로 읽은 페이지별 텍스트와 이슈 인용을 매칭해, 해당 인용이 있을 법한 페이지(0-based)를 고릅니다.
 * 인용이 텍스트 레이어와 어긋나면 첫 페이지로 떨어질 수 있습니다.
 */
export function findPageIndexForIssueQuote(
  pageTexts: string[],
  originalText: string | undefined
): number {
  const q = originalText?.trim() ?? ""
  if (pageTexts.length === 0) return 0
  if (q.length < 2) return 0

  let bestIdx = 0
  let bestScore = 0

  for (let p = 0; p < pageTexts.length; p++) {
    const ranges = findMatchRanges(pageTexts[p], originalText ?? "")
    const pageScore =
      ranges.length === 0
        ? 0
        : Math.max(...ranges.map(([a, b]) => b - a))
    if (pageScore > bestScore) {
      bestScore = pageScore
      bestIdx = p
    }
  }
  if (bestScore >= 2) return bestIdx

  const needle = normalizeForMatch(q).replace(/\s+/g, " ").slice(0, 48)
  if (needle.length >= 2) {
    for (let p = 0; p < pageTexts.length; p++) {
      if (normalizeForMatch(pageTexts[p]).replace(/\s+/g, " ").includes(needle)) {
        return p
      }
    }
  }
  return 0
}

/**
 * PDF 페이지 텍스트와 인용이 실제로 매칭될 때만 1-based 페이지 번호를 돌려줍니다.
 * 매칭 불가(스캔 PDF 등)면 null — UI에서 (p. n) 생략용.
 */
export function findPdfPage1BasedForIssue(
  pageTexts: string[],
  originalText: string | undefined
): number | null {
  const q = originalText?.trim() ?? ""
  if (pageTexts.length === 0) return null
  if (q.length < 2) return null

  let bestIdx = 0
  let bestScore = 0

  for (let p = 0; p < pageTexts.length; p++) {
    const ranges = findMatchRanges(pageTexts[p], originalText ?? "")
    const pageScore =
      ranges.length === 0
        ? 0
        : Math.max(...ranges.map(([a, b]) => b - a))
    if (pageScore > bestScore) {
      bestScore = pageScore
      bestIdx = p
    }
  }
  if (bestScore >= 2) return bestIdx + 1

  const needle = normalizeForMatch(q).replace(/\s+/g, " ").slice(0, 48)
  if (needle.length >= 2) {
    for (let p = 0; p < pageTexts.length; p++) {
      if (
        normalizeForMatch(pageTexts[p]).replace(/\s+/g, " ").includes(needle)
      ) {
        return p + 1
      }
    }
  }
  return null
}

/** 발표 대본: 문장 단위 분리(마침표·줄바꿈 기준). */
function splitIntoSentencesForLocation(text: string): string[] {
  const t = text.replace(/\r\n/g, "\n").trim()
  if (!t) return []
  let parts = t
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (parts.length <= 1 && t.includes("\n")) {
    parts = t
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  return parts
}

/**
 * 발표 대본에서 인용이 걸리는 문장의 1-based 순번.
 * 매칭 실패 시 null.
 */
export function findSentenceIndex1Based(
  scriptText: string,
  originalText: string | undefined
): number | null {
  const q = originalText?.trim() ?? ""
  if (q.length < 2) return null
  const sentences = splitIntoSentencesForLocation(scriptText)
  if (sentences.length === 0) return null

  for (let i = 0; i < sentences.length; i++) {
    if (findMatchRanges(sentences[i], originalText ?? "").length > 0) {
      return i + 1
    }
  }
  const needle = normalizeForMatch(q).replace(/\s+/g, " ").slice(0, 48)
  if (needle.length >= 2) {
    for (let i = 0; i < sentences.length; i++) {
      if (
        normalizeForMatch(sentences[i])
          .replace(/\s+/g, " ")
          .includes(needle)
      ) {
        return i + 1
      }
    }
  }
  return null
}

/**
 * 비-PDF 발표 자료 텍스트에서 인용이 속한 블록까지의 마지막 "슬라이드 N" 등 번호.
 * PDF 페이지는 findPdfPage1BasedForIssue로 별도 처리.
 */
export function findSlidePageInMaterialText(
  materialText: string,
  originalText: string | undefined
): number | null {
  const q = originalText?.trim() ?? ""
  if (q.length < 2 || !materialText.trim()) return null

  const blocks = materialText.split(/\n\s*\n+/)
  let lastSlide: number | null = null

  for (const block of blocks) {
    for (const line of block.split("\n")) {
      const t = line.trim()
      const mSlide = /^(?:슬라이드|Slide|slide)\s*[:\.]?\s*(\d+)/i.exec(t)
      if (mSlide) lastSlide = parseInt(mSlide[1], 10)
      const mFrac = /^(\d+)\s*[\/／]\s*\d+$/.exec(t)
      if (mFrac) lastSlide = parseInt(mFrac[1], 10)
    }
    if (findMatchRanges(block, originalText ?? "").length > 0) {
      return lastSlide
    }
  }
  return null
}

/** 이슈 인용이 대본 쪽과 자료 쪽 중 어디에 더 잘 맞는지(하이라이트 분리용) */
export function assignIssueToScriptOrMaterial(
  issue: PresentationIssue,
  scriptText: string,
  materialText: string
): "script" | "material" {
  const q = issue.originalText?.trim() ?? ""
  if (q.length < 2) return "script"
  const sr = findMatchRanges(scriptText, issue.originalText ?? "")
  const mr = findMatchRanges(materialText, issue.originalText ?? "")
  const sScore =
    sr.length === 0 ? 0 : Math.max(...sr.map(([a, b]) => b - a))
  const mScore =
    mr.length === 0 ? 0 : Math.max(...mr.map(([a, b]) => b - a))
  if (mScore > sScore) return "material"
  if (sScore > mScore) return "script"
  return mr.length > sr.length ? "material" : "script"
}
