"use client"

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react"
import type { PresentationIssue } from "@/types/analysis"
import { buildSourceSegments } from "@/lib/uready/build-source-segments"

const HIGHLIGHT_CLASS =
  "bg-amber-100 text-amber-950 ring-1 ring-amber-300/80 hover:bg-amber-200/90"

export type SourceTextPanelHandle = {
  /** 원문 패널에서 해당 허점이 처음 등장하는 하이라이트로 스크롤 */
  scrollToIssue: (issueIndex: number) => void
}

function scrollToIssueCard(issueIndex: number) {
  const el = document.getElementById(`uready-issue-${issueIndex}`)
  el?.scrollIntoView({ behavior: "smooth", block: "start" })
  el?.classList.add("ring-2", "ring-primary", "ring-offset-2")
  window.setTimeout(() => {
    el?.classList.remove("ring-2", "ring-primary", "ring-offset-2")
  }, 1600)
}

type SourceTextPanelProps = {
  sourceText: string
  issues: PresentationIssue[]
  /** 0-based, 화살표·연동용 */
  activeIssueIndex: number
  onActiveIssueIndexChange: (index: number) => void
  /** ◀ ▶ 한 단계 (순환) */
  onNavigateIssue: (delta: -1 | 1) => void
}

export const SourceTextPanel = forwardRef<
  SourceTextPanelHandle,
  SourceTextPanelProps
>(function SourceTextPanel(
  {
    sourceText,
    issues,
    activeIssueIndex,
    onActiveIssueIndexChange,
    onNavigateIssue,
  },
  ref
) {
  const preRef = useRef<HTMLPreElement | null>(null)

  const scrollToIssue = useCallback((issueIndex: number) => {
    const root = preRef.current
    if (!root) return
    const buttons = root.querySelectorAll("[data-issue-refs]")
    for (const btn of buttons) {
      const raw = (btn as HTMLElement).dataset.issueRefs ?? ""
      const refs = raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n))
      if (refs.includes(issueIndex)) {
        btn.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        })
        return
      }
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      scrollToIssue,
    }),
    [scrollToIssue]
  )

  const segments = useMemo(
    () => buildSourceSegments(sourceText, issues),
    [sourceText, issues]
  )

  const onMarkClick = useCallback((issueIndices: number[]) => {
    if (issueIndices.length === 0) return
    const k = Math.min(...issueIndices)
    onActiveIssueIndexChange(k)
    scrollToIssueCard(k)
  }, [onActiveIssueIndexChange])

  const n = issues.length

  if (!sourceText.trim()) {
    return (
      <p className="m-0 rounded-xl border border-dashed border-uready-gray-200 bg-uready-gray-50 px-4 py-8 text-center text-sm text-uready-gray-500">
        표시할 원문이 없습니다.
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-uready-gray-200 bg-uready-gray-50/80">
      {n > 0 ? (
        <div className="flex items-center justify-center gap-2 border-b border-uready-gray-200/80 px-3 py-2.5 sm:gap-3 sm:px-5">
          <button
            type="button"
            aria-label="이전 허점"
            onClick={() => onNavigateIssue(-1)}
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-uready-gray-200 bg-white text-sm font-semibold text-uready-gray-700 shadow-sm transition hover:bg-uready-gray-50"
          >
            ◀
          </button>
          <span className="min-w-[7.5rem] text-center text-sm font-semibold tabular-nums text-uready-gray-800">
            허점 {activeIssueIndex + 1} / {n}
          </span>
          <button
            type="button"
            aria-label="다음 허점"
            onClick={() => onNavigateIssue(1)}
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-uready-gray-200 bg-white text-sm font-semibold text-uready-gray-700 shadow-sm transition hover:bg-uready-gray-50"
          >
            ▶
          </button>
        </div>
      ) : null}
      <pre
        ref={preRef}
        className="m-0 max-h-[min(55vh,520px)] overflow-auto whitespace-pre-wrap break-words px-4 py-4 text-[13px] leading-relaxed text-uready-gray-900 sm:px-5 sm:text-sm"
        tabIndex={0}
      >
        {segments.map((seg, idx) => {
          if (seg.type === "text") {
            return <span key={idx}>{seg.content}</span>
          }
          const refsAttr = [...new Set(seg.issueIndices)]
            .sort((a, b) => a - b)
            .join(",")
          const label = seg.issueIndices.map((i) => `#${i + 1}`).join("·")
          return (
            <button
              key={idx}
              type="button"
              data-issue-refs={refsAttr}
              title={`허점 ${seg.issueIndices.map((i) => `#${i + 1}`).join(", ")}로 이동`}
              onClick={() => onMarkClick(seg.issueIndices)}
              className={`mx-px inline rounded px-0.5 align-baseline transition ${HIGHLIGHT_CLASS}`}
            >
              {seg.content}
              <span className="sr-only"> ({label} 매칭)</span>
            </button>
          )
        })}
      </pre>
    </div>
  )
})
