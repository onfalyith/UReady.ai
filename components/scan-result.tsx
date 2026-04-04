"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Share2,
  AlertTriangle,
  MessageSquareWarning,
  FileText,
  Check,
  RefreshCw,
} from "lucide-react"
import { ScanResult as ScanResultType } from "@/lib/types"
import { HighlightedContent } from "./highlighted-content"
import { FlawCard } from "./flaw-card"
import { toast } from "sonner"

interface ScanResultProps {
  result: ScanResultType
  onReset: () => void
}

export function ScanResult({ result, onReset }: ScanResultProps) {
  const [activeFlawId, setActiveFlawId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const flawCardsRef = useRef<Map<string, HTMLDivElement>>(new Map())

  const weaknessCount = result.flaws.filter(
    (f) => f.tag === "논리적 취약점"
  ).length
  const counterCount = result.flaws.filter((f) => f.tag === "반론").length

  useEffect(() => {
    if (activeFlawId) {
      const element = flawCardsRef.current.get(activeFlawId)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [activeFlawId])

  const handleCopyResult = async () => {
    const markdown = generateMarkdownSummary(result)

    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      toast.success("결과가 복사되었습니다.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("복사에 실패했습니다.")
    }
  }

  const handleFlawClick = (id: string) => {
    setActiveFlawId(activeFlawId === id ? null : id)
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 pb-8">
      <div className="mb-6 p-4 rounded-lg border bg-muted/30">
        <p className="text-sm font-semibold mb-1">검증 요약</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {result.analysis.summary}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">검증 결과</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="secondary"
              className="gap-1.5 highlight-weakness border-0"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              논리적 취약점 {weaknessCount}개
            </Badge>
            <Badge
              variant="secondary"
              className="gap-1.5 highlight-counter border-0"
            >
              <MessageSquareWarning className="h-3.5 w-3.5" />
              반론 {counterCount}개
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">새로 검증</span>
          </Button>
          <Button onClick={handleCopyResult} className="gap-2">
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            {copied ? "복사됨" : "결과 복사"}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              원문
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              하이라이트를 클릭하면 해당 이슈로 이동합니다
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] md:h-[400px] lg:h-[calc(100vh-320px)] pr-4">
              <HighlightedContent
                content={result.originalContent}
                flaws={result.flaws}
                activeFlawId={activeFlawId}
                onFlawClick={handleFlawClick}
              />
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">이슈 목록</h2>
            <span className="text-sm text-muted-foreground">
              총 {result.flaws.length}개
            </span>
          </div>

          <ScrollArea className="h-[400px] lg:h-[calc(100vh-240px)]">
            <div className="space-y-4 pr-4">
              {result.flaws.map((flaw, index) => (
                <div
                  key={flaw.id}
                  ref={(el) => {
                    if (el) flawCardsRef.current.set(flaw.id, el)
                  }}
                >
                  <FlawCard
                    flaw={flaw}
                    index={index}
                    isActive={activeFlawId === flaw.id}
                    onClick={() => handleFlawClick(flaw.id)}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="mt-8 p-4 bg-muted/50 rounded-lg border border-dashed">
        <p className="text-center text-sm text-muted-foreground">
          새로고침 시 이 화면의 결과는 사라집니다. 필요하면 복사해 두세요.
        </p>
      </div>
    </div>
  )
}

function generateMarkdownSummary(result: ScanResultType): string {
  let md = `# 발표 자료 검증 결과\n\n`
  md += `## 요약\n${result.analysis.summary}\n\n`
  md += `## 통계\n`
  md += `- 논리적 취약점: ${result.flaws.filter((f) => f.tag === "논리적 취약점").length}개\n`
  md += `- 반론: ${result.flaws.filter((f) => f.tag === "반론").length}개\n\n`

  result.flaws.forEach((flaw, index) => {
    md += `### ${index + 1}. [${flaw.tag}] ${flaw.originalText.slice(0, 80)}${flaw.originalText.length > 80 ? "…" : ""}\n`
    md += `- 이유: ${flaw.reason}\n`
    md += `- 개선 질문: ${flaw.improvementQuestion}\n`
    flaw.evidence.forEach((ev, j) => {
      md += `  - 근거 ${j + 1}: ${ev.title} (${ev.stance})${ev.url ? ` — ${ev.url}` : ""}\n`
      md += `    ${ev.snippet}\n`
    })
    md += `\n`
  })

  return md
}
