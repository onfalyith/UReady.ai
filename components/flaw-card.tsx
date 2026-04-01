"use client"

import { useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, MessageSquareWarning, Download, Quote, Lightbulb } from "lucide-react"
import { Flaw } from "@/lib/types"
import html2canvas from "html2canvas"

interface FlawCardProps {
  flaw: Flaw
  index: number
  isActive: boolean
  onClick: () => void
}

export function FlawCard({ flaw, index, isActive, onClick }: FlawCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const isWeakness = flaw.category === "weakness"
  const Icon = isWeakness ? AlertTriangle : MessageSquareWarning
  const categoryLabel = isWeakness ? "논리적 취약점" : "반론"
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
        isActive 
          ? "ring-2 ring-primary shadow-lg" 
          : "hover:shadow-md"
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

        {/* Original text quote */}
        <div className="flex gap-2 mb-3">
          <Quote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground italic line-clamp-2">
            {`"${flaw.originalText}"`}
          </p>
        </div>

        {/* Reason */}
        <div className="mb-3">
          <h4 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
            이유
          </h4>
          <p className="text-sm text-foreground leading-relaxed">
            {flaw.reason}
          </p>
        </div>

        {/* Improvement question */}
        <div className="bg-muted/50 rounded-lg p-3">
          <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1.5 text-primary">
            <Lightbulb className="h-4 w-4" />
            개선 방향 질문
          </h4>
          <p className="text-sm text-foreground leading-relaxed">
            {flaw.improvementQuestion}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
