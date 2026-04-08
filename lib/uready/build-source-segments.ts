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

/** 원문에서 인용구가 나타나는 구간(여러 변형 순차 시도) */
function findMatchRanges(source: string, quote: string): [number, number][] {
  const src = normalizeSpacesForIndexPreserve(source)
  const raw = normalizeSpacesForIndexPreserve(quote).trim()
  if (raw.length < 2) return []

  const candidates = Array.from(
    new Set(
      [
        raw,
        raw.replace(/\r\n/g, "\n"),
        raw.replace(/\n/g, " "),
        raw.replace(/\s+/g, " "),
      ].filter((s) => s.length >= 2)
    )
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

  for (const [a, b] of findFlexibleWhitespaceTokenRanges(src, raw)) {
    push(a, b)
  }

  return ranges
}

/**
 * 제출 원문을 일반 텍스트 / 이슈별 하이라이트 구간으로 나눕니다.
 * 겹치는 구간은 issueIndices에 모두 담습니다.
 */
export function buildSourceSegments(
  source: string,
  issues: PresentationIssue[]
): SourceSegment[] {
  const n = source.length
  if (n === 0) return []

  const perChar: number[][] = Array.from({ length: n }, () => [])

  issues.forEach((issue, issueIndex) => {
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
