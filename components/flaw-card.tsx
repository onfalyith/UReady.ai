"use client"

import { useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertTriangle,
  MessageSquareWarning,
  Download,
  Quote,
  Lightbulb,
  ExternalLink,
} from "lucide-react"
import type { Flaw } from "@/lib/types"
import html2canvas from "html2canvas"

function stanceLabel(stance: string) {
  if (stance === "supports") return "지지"
  if (stance === "contradicts") return "반박"
  return "근거 부족"
}

interface FlawCardProps {
  flaw: Flaw
  index: number
  isActive: boolean
  onClick: () => void
}

export function FlawCard({ flaw, index, isActive, onClick }: FlawCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const isWeakness = flaw.tag === "논리적 취약점"
  const Icon = isWeakness ? AlertTriangle : MessageSquareWarning
  const categoryLabel = flaw.tag
  const highlightClass = isWeakness ? "highlight-weakness" : "highlight-counter"

  const handleDownloadImage = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!cardRef.current) return

    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
      })
      const link = document.createElement("a")
      link.download = `허점-${index + 1}-${categoryLabel}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    } catch (error) {
      console.error("이미지 저장 실패:", error)
    }
  }

  return (
    <Card
      ref={cardRef}
      className={`cursor-pointer transition-all duration-200 ${
        isActive ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={`gap-1.5 ${highlightClass} border-0`}
            >
              <Icon className="h-3.5 w-3.5" />
              {categoryLabel}
            </Badge>
            <span className="text-sm text-muted-foreground font-medium">
              #{index + 1}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleDownloadImage}
            title="이미지로 저장"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2 mb-3">
          <Quote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground italic line-clamp-2">
            {`"${flaw.originalText}"`}
          </p>
        </div>

        <div className="mb-3">
          <h4 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
            이유
          </h4>
          <p className="text-sm text-foreground leading-relaxed">{flaw.reason}</p>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 mb-4">
          <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1.5 text-primary">
            <Lightbulb className="h-4 w-4" />
            개선 방향 질문
          </h4>
          <p className="text-sm text-foreground leading-relaxed">
            {flaw.improvementQuestion}
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            출처 근거 (evidence)
          </h4>
          <ul className="space-y-2">
            {flaw.evidence.map((ev, i) => (
              <li
                key={`${flaw.id}-ev-${i}`}
                className="text-sm border rounded-md p-2.5 bg-background/80"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium line-clamp-1">{ev.title}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {stanceLabel(ev.stance)}
                  </Badge>
                </div>
                {ev.url ? (
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary inline-flex items-center gap-1 mb-1 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ev.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                <p className="text-xs text-muted-foreground leading-snug">
                  {ev.snippet}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
