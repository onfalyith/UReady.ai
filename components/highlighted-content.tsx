"use client"

import { useRef, useEffect } from "react"
import { Flaw } from "@/lib/types"

interface HighlightedContentProps {
  content: string
  flaws: Flaw[]
  activeFlawId: string | null
  onFlawClick: (id: string) => void
}

interface TextSegment {
  text: string
  flawId?: string
  tag?: "논리적 취약점" | "반론"
}

export function HighlightedContent({ 
  content, 
  flaws, 
  activeFlawId, 
  onFlawClick 
}: HighlightedContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const highlightRefs = useRef<Map<string, HTMLSpanElement>>(new Map())

  // Scroll to active highlight when activeFlawId changes
  useEffect(() => {
    if (activeFlawId) {
      const element = highlightRefs.current.get(activeFlawId)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [activeFlawId])

  // Create segments with highlights
  const createSegments = (): TextSegment[] => {
    if (flaws.length === 0) {
      return [{ text: content }]
    }

    // Sort flaws by start index
    const sortedFlaws = [...flaws].sort((a, b) => a.startIndex - b.startIndex)
    const segments: TextSegment[] = []
    let lastIndex = 0

    for (const flaw of sortedFlaws) {
      // Add text before this flaw
      if (flaw.startIndex > lastIndex) {
        segments.push({
          text: content.slice(lastIndex, flaw.startIndex)
        })
      }

      // Add the flaw highlight
      segments.push({
        text: content.slice(flaw.startIndex, flaw.endIndex),
        flawId: flaw.id,
        tag: flaw.tag,
      })

      lastIndex = flaw.endIndex
    }

    // Add remaining text
    if (lastIndex < content.length) {
      segments.push({
        text: content.slice(lastIndex)
      })
    }

    return segments
  }

  const segments = createSegments()

  return (
    <div 
      ref={containerRef}
      className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-wrap"
    >
      {segments.map((segment, index) => {
        if (segment.flawId) {
          const isActive = segment.flawId === activeFlawId
          const highlightClass =
            segment.tag === "논리적 취약점"
              ? "highlight-weakness"
              : "highlight-counter"
          
          return (
            <span
              key={index}
              ref={(el) => {
                if (el) highlightRefs.current.set(segment.flawId!, el)
              }}
              className={`${highlightClass} ${
                isActive ? "ring-2 ring-primary ring-offset-1" : ""
              }`}
              onClick={() => onFlawClick(segment.flawId!)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onFlawClick(segment.flawId!)
                }
              }}
            >
              {segment.text}
            </span>
          )
        }
        return <span key={index}>{segment.text}</span>
      })}
    </div>
  )
}
