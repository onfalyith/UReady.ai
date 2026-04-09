"use client"

import { useCallback, useRef } from "react"
import { IssueCard } from "@/components/issue-card"
import { cn } from "@/lib/utils"
import type { PresentationIssue } from "@/types/analysis"

export type IssueCardsCarouselProps = {
  issues: PresentationIssue[]
  activeIssueIndex: number
  onNavigateIssue: (delta: -1 | 1) => void
  onActivateIssue: (index: number) => void
  dual: boolean
  resolvedPdfPagesForIssues: Array<number | null>
  dualResolvedLocations: Array<{
    scriptSentence: number | null
    materialPage: number | null
  }> | null
  usedNoToolFallback?: boolean
  className?: string
  /** 모바일 바텀시트 등: 드래그 영역 레이아웃 */
  slideScrollClassName?: string
  /** 바텀시트 `aria-controls` 등 */
  id?: string
}

const SWIPE_THRESHOLD_PX = 56

function isNarrowTouchCarousel(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

export function IssueCardsCarousel({
  issues,
  activeIssueIndex,
  onNavigateIssue,
  onActivateIssue,
  dual,
  resolvedPdfPagesForIssues,
  dualResolvedLocations,
  usedNoToolFallback = false,
  className,
  slideScrollClassName,
  id,
}: IssueCardsCarouselProps) {
  const startX = useRef<number | null>(null)
  const pointerIdRef = useRef<number | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isNarrowTouchCarousel()) return
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      if (el.closest("a, button, input, textarea, select, [role='tab']")) {
        return
      }
      startX.current = e.clientX
      pointerIdRef.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    []
  )

  const finishPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (startX.current == null) return
      if (!isNarrowTouchCarousel()) {
        startX.current = null
        const pid = pointerIdRef.current
        pointerIdRef.current = null
        if (pid != null) {
          try {
            e.currentTarget.releasePointerCapture(pid)
          } catch {
            /* already released */
          }
        }
        return
      }
      if (issues.length >= 2) {
        const dx = e.clientX - startX.current
        if (dx > SWIPE_THRESHOLD_PX) onNavigateIssue(-1)
        else if (dx < -SWIPE_THRESHOLD_PX) onNavigateIssue(1)
      }
      startX.current = null
      const pid = pointerIdRef.current
      pointerIdRef.current = null
      if (pid != null) {
        try {
          e.currentTarget.releasePointerCapture(pid)
        } catch {
          /* already released */
        }
      }
    },
    [issues.length, onNavigateIssue]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      finishPointer(e)
    },
    [finishPointer]
  )

  const onPointerCancel = useCallback(() => {
    startX.current = null
    pointerIdRef.current = null
  }, [])

  return (
    <div
      id={id}
      className={cn("relative min-h-0 w-full overflow-hidden", className)}
      role="region"
      aria-label="허점 카드"
      aria-live="polite"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          onNavigateIssue(-1)
        } else if (e.key === "ArrowRight") {
          e.preventDefault()
          onNavigateIssue(1)
        }
      }}
    >
      <div
        className={cn(
          "touch-pan-y max-md:cursor-grab max-md:active:cursor-grabbing md:cursor-default md:touch-auto",
          slideScrollClassName
        )}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className="flex w-full transition-transform duration-300 ease-out will-change-transform"
          style={{
            transform: `translate3d(-${activeIssueIndex * 100}%, 0, 0)`,
          }}
        >
          {issues.map((issue, index) => (
            <div
              key={`${issue.location}-${index}`}
              className="w-full min-w-full shrink-0 px-0.5 max-md:max-h-[min(42vh,380px)] max-md:overflow-y-auto max-md:overscroll-y-contain md:max-h-none md:overflow-visible"
              aria-hidden={activeIssueIndex !== index}
            >
              <IssueCard
                issue={issue}
                index={index}
                resolvedPdfPage={
                  dual ? null : resolvedPdfPagesForIssues[index] ?? null
                }
                dualSourceMode={dual}
                dualScriptSentence={
                  dualResolvedLocations?.[index]?.scriptSentence ?? null
                }
                dualMaterialPage={
                  dualResolvedLocations?.[index]?.materialPage ?? null
                }
                usedNoToolFallback={usedNoToolFallback}
                onActivate={onActivateIssue}
                as="article"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
