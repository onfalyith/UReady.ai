import type { Flaw, ScanResult } from "@/lib/types"

type StringCandidate = {
  path: string
  value: string
}

function isLikelyFileName(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  return /\.(pdf|txt|doc|docx|ppt|pptx|png|jpg|jpeg|gif|webp)$/i.test(t)
}

function collectStringCandidates(
  value: unknown,
  path = "root",
  out: StringCandidate[] = []
): StringCandidate[] {
  if (typeof value === "string" && value.trim()) {
    out.push({ path, value: value.trim() })
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) =>
      collectStringCandidates(item, `${path}[${idx}]`, out)
    )
    return out
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    Object.entries(obj).forEach(([key, child]) =>
      collectStringCandidates(child, `${path}.${key}`, out)
    )
  }
  return out
}

function scoreCandidate(c: StringCandidate): number {
  const text = c.value
  const lowerPath = c.path.toLowerCase()
  let score = 0

  if (lowerPath.includes(".data.outputs")) score += 300
  if (
    lowerPath.endsWith(".text") ||
    lowerPath.endsWith(".result") ||
    lowerPath.endsWith(".answer") ||
    lowerPath.endsWith(".output") ||
    lowerPath.endsWith(".analysis") ||
    lowerPath.endsWith(".content")
  ) {
    score += 200
  }
  if (lowerPath.includes(".message")) score += 60

  if (text.length >= 120) score += 80
  else if (text.length >= 60) score += 40
  else if (text.length < 20) score -= 40

  if (text.includes("• [") || text.includes("- 논리적 취약점")) score += 220
  if (text.includes("개선 방향")) score += 120
  if (text.includes("\n")) score += 20

  if (isLikelyFileName(text)) score -= 260
  if (text.length <= 16 && !text.includes(" ")) score -= 40

  return score
}

function extractDifyAnalysisText(workflow: Record<string, unknown>): string {
  const candidates = collectStringCandidates(workflow)
    .filter((c) => !isLikelyFileName(c.value))
    .filter((c) => c.value.length >= 12)

  if (candidates.length === 0) return ""

  const best = candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0]
  return best?.value ?? ""
}

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, "\n").trim()
}

function findSpan(content: string, needle: string, fallbackStart: number): [number, number] {
  const normalizedNeedle = needle.replace(/^\[[^\]]+\]\s*/, "").trim()
  const searchNeedle = normalizedNeedle.slice(0, 40)
  const idx = searchNeedle ? content.indexOf(searchNeedle) : -1

  if (idx >= 0) {
    return [idx, Math.min(content.length, idx + Math.max(searchNeedle.length, 20))]
  }

  const start = Math.min(Math.max(0, fallbackStart), Math.max(0, content.length - 1))
  const end = Math.min(content.length, start + Math.max(20, Math.floor(content.length * 0.1)))
  return [start, Math.max(start + 1, end)]
}

function parseFlawsFromFormattedOutput(
  analysisText: string,
  content: string
): Flaw[] {
  const normalized = normalizeLineBreaks(analysisText)
  if (!normalized) return []

  const chunks = normalized
    .split(/\n(?=•\s)/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("• "))

  const flaws: Flaw[] = []
  let fallbackCursor = 0

  chunks.forEach((chunk, index) => {
    const firstLine = chunk.split("\n")[0] ?? ""
    const summaryMatch = firstLine.match(/원문 문장:\s*(.+)$/)
    const summary = (summaryMatch?.[1] ?? firstLine.replace(/^•\s*/, "")).trim()

    const reasonMatch = chunk.match(
      /- 논리적 취약점(?: 및 반론)?:\s*([\s\S]*?)\n- 개선 방향:/m
    )
    const questionMatch = chunk.match(/- 개선 방향:\s*(.+)$/m)

    const reason = (reasonMatch?.[1] ?? "").trim()
    const question = (questionMatch?.[1] ?? "").trim()
    const [startIndex, endIndex] = findSpan(content, summary, fallbackCursor)
    fallbackCursor = Math.min(content.length, endIndex + 1)

    flaws.push({
      id: `dify-${index}`,
      tag: "논리적 취약점",
      originalText: summary || "원문 요약을 추출하지 못했습니다.",
      reason: reason || chunk,
      improvementQuestion:
        question || "이 주장의 전제와 근거를 어떻게 다시 검증할 수 있을까요?",
      startIndex,
      endIndex,
      evidence: [
        {
          title: "Dify 워크플로 출력",
          url: "",
          snippet:
            "레거시 Dify 경로에서는 검색 그라운딩 근거가 별도로 수집되지 않습니다.",
          stance: "insufficient",
        },
      ],
    })
  })

  return flaws
}

export function mapDifyWorkflowToScanResult(
  workflow: Record<string, unknown>,
  originalContent: string
): ScanResult {
  const analysisText = extractDifyAnalysisText(workflow)
  const flaws = parseFlawsFromFormattedOutput(analysisText, originalContent)

  if (flaws.length > 0) {
    const analysis = {
      summary:
        analysisText.slice(0, 800) ||
        "Dify 워크플로에서 추출한 텍스트 기반 요약입니다.",
      issues: flaws,
    }
    return {
      originalContent,
      analysis,
      flaws,
    }
  }

  const fallbackText = analysisText || "분석 결과 텍스트를 찾지 못했습니다."
  const fallbackFlaws: Flaw[] = [
    {
      id: "dify-fallback",
      tag: "논리적 취약점",
      originalText: originalContent.slice(0, 80) || "원문",
      reason: fallbackText,
      improvementQuestion: "이 결론이 성립하려면 어떤 근거가 추가로 필요할까요?",
      startIndex: 0,
      endIndex: Math.min(40, Math.max(1, originalContent.length)),
      evidence: [
        {
          title: "분석 출력 없음",
          url: "",
          snippet: "워크플로 응답에서 구조화된 이슈를 만들지 못했습니다.",
          stance: "insufficient",
        },
      ],
    },
  ]
  return {
    originalContent,
    analysis: { summary: fallbackText, issues: fallbackFlaws },
    flaws: fallbackFlaws,
  }
}

