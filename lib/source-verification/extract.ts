import crypto from "node:crypto"

import type { CitationType, SourceCitation } from "@/lib/types"

function normalizeUrl(url: string) {
  // 불필요한 trailing punctuation 제거
  return url.replace(/[.,;:)\]]+$/, "")
}

function normalizeDoi(doi: string) {
  return doi.trim().replace(/^doi\.org\//i, "").replace(/[.,;:)\]]+$/, "")
}

function makeId() {
  return crypto.randomUUID()
}

function pushOrMerge(
  list: SourceCitation[],
  candidate: Omit<SourceCitation, "id"> & { id?: string }
) {
  const key =
    candidate.type === "url"
      ? `url:${(candidate.url ?? "").toLowerCase()}`
      : candidate.type === "doi"
        ? `doi:${(candidate.doi ?? "").toLowerCase()}`
        : `raw:${candidate.raw.toLowerCase()}`

  const existing = list.find((x) => {
    const existingKey =
      x.type === "url"
        ? `url:${(x.url ?? "").toLowerCase()}`
        : x.type === "doi"
          ? `doi:${(x.doi ?? "").toLowerCase()}`
          : `raw:${x.raw.toLowerCase()}`
    return existingKey === key
  })

  if (existing) return
  list.push({ id: candidate.id ?? makeId(), ...candidate })
}

export type ExtractOptions = {
  maxCandidates?: number
  /**
   * true면 OPENAI_API_KEY 등이 있을 때만 LLM 호출을 시도합니다.
   * (없으면 regex 기반만 사용)
   */
  useLlm?: boolean
}

/**
 * MVP: URL/DOI 기반 출처 후보를 추출합니다.
 * - regex는 항상 수행
 * - LLM은 (옵션 && 키 존재 시) "구조화 추출 보조"로만 사용
 */
export async function extractSourceCandidatesFromText(
  content: string,
  options?: ExtractOptions
): Promise<SourceCitation[]> {
  const maxCandidates = options?.maxCandidates ?? 20
  const useLlm = options?.useLlm ?? true

  const citations: SourceCitation[] = []

  // 1) URL
  const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/gi
  for (const match of content.matchAll(urlRegex)) {
    const raw = match[0]
    const url = normalizeUrl(raw)
    if (!url) continue
    pushOrMerge(citations, { type: "url", raw, url } as Omit<
      SourceCitation,
      "id"
    >)
    if (citations.length >= maxCandidates) break
  }

  // 2) DOI
  // - doi:10.1234/xxxx 처럼 "10." 시작 패턴을 포착
  const doiRegex =
    /(?:doi\.org\/)?(10\.\d{4,9}\/[^\s<>"')\]]+)/gi
  for (const match of content.matchAll(doiRegex)) {
    const raw = match[0]
    const doi = normalizeDoi(match[1] ?? raw)
    if (!doi) continue
    pushOrMerge(citations, { type: "doi", raw, doi } as Omit<
      SourceCitation,
      "id"
    >)
    if (citations.length >= maxCandidates) break
  }

  // 3) LLM 보조(선택): regex로 찾지 못한 "기타 출처(논문 제목/기관명 등)"를
  // url/doi 중심으로 보강합니다. 실제 존재 검증은 api-external 단계에서 합니다.
  const shouldTryLlm =
    useLlm &&
    process.env.OPENAI_API_KEY &&
    process.env.SOURCE_VERIFY_LLM_EXTRACT !== "false" &&
    citations.length < maxCandidates

  if (!shouldTryLlm) return citations

  try {
    const model = process.env.SOURCE_VERIFY_LLM_MODEL ?? "gpt-4o-mini"
    const systemPrompt = [
      "너는 출처 추출기다.",
      "아래 텍스트에서 인용/출처로 보이는 항목을 추출해라.",
      "MVP에서는 url과 doi를 최우선으로 추출한다.",
      "출력은 반드시 JSON만 반환한다.",
      "스키마: {\"items\":[{\"type\":\"url|doi|unknown\",\"raw\":string,\"url\":string|null,\"doi\":string|null}]}",
    ].join("\n")

    const userPrompt = [
      "텍스트:",
      content,
      "",
      "추출 결과 JSON만 반환:",
    ].join("\n")

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
      }),
    })

    if (!res.ok) return citations

    const jsonText = await res.text()
    // responses are sometimes wrapped; extract first JSON object defensively
    const parsed = JSON.parse(jsonText) as any
    const text =
      parsed?.choices?.[0]?.message?.content ??
      parsed?.choices?.[0]?.text ??
      ""

    const maybeJson = text.trim().match(/\{[\s\S]*\}/)
    if (!maybeJson) return citations

    const payload = JSON.parse(maybeJson[0]) as {
      items?: Array<{
        type: CitationType
        raw: string
        url?: string | null
        doi?: string | null
      }>
    }

    for (const item of payload.items ?? []) {
      const type = item.type ?? "unknown"
      const raw = item.raw
      if (!raw || typeof raw !== "string") continue

      if (type === "url" && item.url) {
        pushOrMerge(citations, {
          type: "url",
          raw,
          url: normalizeUrl(item.url),
        })
      } else if (type === "doi" && item.doi) {
        pushOrMerge(citations, {
          type: "doi",
          raw,
          doi: normalizeDoi(item.doi),
        })
      } else {
        pushOrMerge(citations, { type: "unknown", raw })
      }

      if (citations.length >= maxCandidates) break
    }
  } catch {
    // LLM 추출 실패 시 regex 결과만 사용
  }

  return citations.slice(0, maxCandidates)
}

