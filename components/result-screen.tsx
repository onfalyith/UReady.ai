"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PdfPagesPanel } from "@/components/pdf-pages-panel"
import { SharedNav } from "@/components/uready/shared-nav"
import { IssueCard } from "@/components/issue-card"
import {
  SourceTextPanel,
  type SourceTextPanelHandle,
} from "@/components/source-text-panel"
import type { AnalysisMaterialMeta } from "@/lib/ai/schema"
import { extractPdfPageTextsArray } from "@/lib/client/pdf-page-text"
import {
  assignIssueToScriptOrMaterial,
  findPdfPage1BasedForIssue,
  findSentenceIndex1Based,
  findSlidePageInMaterialText,
} from "@/lib/uready/build-source-segments"
import type { PresentationAnalysis, PresentationIssue } from "@/types/analysis"
import { cn } from "@/lib/utils"

function PdfViewToggle({
  mode,
  onModeChange,
}: {
  mode: "pages" | "text"
  onModeChange: (m: "pages" | "text") => void
}) {
  const base =
    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
  const active = "border-primary bg-white text-primary"
  const idle =
    "border-uready-gray-200 bg-white text-uready-gray-700 hover:bg-uready-gray-50"
  return (
    <div
      className="mb-3 flex flex-wrap gap-2"
      role="tablist"
      aria-label="원문 표시 방식"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "pages"}
        onClick={() => onModeChange("pages")}
        className={`${base} ${mode === "pages" ? active : idle}`}
      >
        페이지 이미지
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "text"}
        onClick={() => onModeChange("text")}
        className={`${base} ${mode === "text" ? active : idle}`}
      >
        추출 텍스트 (하이라이트)
      </button>
    </div>
  )
}

function IssueNavigatorRow({
  n,
  activeIssueIndex,
  onNavigateIssue,
}: {
  n: number
  activeIssueIndex: number
  onNavigateIssue: (delta: -1 | 1) => void
}) {
  if (n === 0) return null
  return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-uready-gray-200 bg-uready-gray-50/80 px-3 py-2.5 sm:gap-3 sm:px-5">
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
  )
}

function buildIssueIndexSets(
  issues: PresentationIssue[],
  scriptText: string,
  materialText: string
): { script: Set<number>; material: Set<number> } {
  const script = new Set<number>()
  const material = new Set<number>()
  issues.forEach((issue, i) => {
    if (assignIssueToScriptOrMaterial(issue, scriptText, materialText) === "material") {
      material.add(i)
    } else {
      script.add(i)
    }
  })
  return { script, material }
}

function buildCopyText(
  data: PresentationAnalysis,
  displayFilename: string,
  opts?: { usedNoToolFallback?: boolean }
) {
  const noWeb = opts?.usedNoToolFallback === true
  const lines = [
    "📋 UReady.ai — 발표 전에 꼭 확인할 부분",
    "",
    `파일/출처: ${displayFilename}`,
    `허점 수: ${data.issues.length}`,
    "",
  ]
  if (noWeb) {
    lines.push("(이번 분석: 웹 검색 없음 — 출처·근거 블록 생략)")
    lines.push("")
  }
  data.issues.forEach((issue, i) => {
    lines.push(`허점 #${i + 1} (${issue.location})`)
    lines.push(`발표에 들어간 문장: ${issue.originalText}`)
    lines.push(`왜 이 부분이 위험한가: ${issue.categoryCheck}`)
    lines.push(`왜 질문이 들어올 수 있나 (논리): ${issue.logicalWeakness}`)
    lines.push(`왜 질문이 들어올 수 있나 (예상 반론): ${issue.counterArgument}`)
    lines.push(`발표 전에 이렇게 확인해보세요: ${issue.improvementQuestion}`)
    if (!noWeb) {
      if (issue.sourceReliability === "low_credibility") {
        lines.push("(근거 자료 출처의 신뢰도가 낮습니다)")
      } else if (issue.sourceReliability === "unverified") {
        lines.push("(근거 자료의 출처가 확인되지 않습니다)")
      }
      issue.evidence.forEach((ev) => {
        lines.push(
          `  - [${ev.stance}] ${ev.title} | ${ev.url}\n    ${ev.snippet}`
        )
      })
    }
    lines.push("")
  })
  if (data.issues.length === 0) {
    lines.push("눈에 띄는 허점이 발견되지 않았어요.")
  }
  return lines.join("\n")
}

type ResultScreenProps = {
  displayFilename: string
  /** 분석에 사용된 본문(단일 또는 대본+자료 결합) */
  sourceText: string
  /** 단일 입력이 PDF일 때 페이지 미리보기용 */
  pdfFile: File | null
  /** 대본+자료 동시 제출 시 구분 표시 */
  dualSourceMode?: boolean
  scriptText?: string
  materialText?: string
  materialFilename?: string
  /** 이중 입력이고 발표 자료가 PDF일 때 */
  materialPdfFile?: File | null
  analysis: PresentationAnalysis
  materialMeta: AnalysisMaterialMeta | null
  onReset: () => void
  onLogoClick: () => void
}

export function ResultScreen({
  displayFilename,
  sourceText,
  pdfFile,
  dualSourceMode = false,
  scriptText = "",
  materialText = "",
  materialFilename = "",
  materialPdfFile = null,
  analysis,
  materialMeta,
  onReset,
  onLogoClick,
}: ResultScreenProps) {
  const [toastOpen, setToastOpen] = useState(false)
  const issues = analysis.issues
  const sourcePanelRef = useRef<SourceTextPanelHandle>(null)
  const scriptPanelRef = useRef<SourceTextPanelHandle>(null)
  const materialPanelRef = useRef<SourceTextPanelHandle>(null)
  const [activeIssueIndex, setActiveIssueIndex] = useState(0)
  const [pdfViewMode, setPdfViewMode] = useState<"pages" | "text">("pages")
  /** max-md: 점검할 부분 바텀시트 — ◀▶·하이라이트 연동 시 자동 확장 */
  const [mobileIssuesSheetExpanded, setMobileIssuesSheetExpanded] =
    useState(false)
  const [mainPdfPageTexts, setMainPdfPageTexts] = useState<string[] | null>(
    null
  )
  const [materialPdfPageTexts, setMaterialPdfPageTexts] = useState<
    string[] | null
  >(null)

  const dual =
    dualSourceMode === true &&
    scriptText.trim().length > 0 &&
    materialText.trim().length > 0

  const materialIssueIndices = useMemo(() => {
    if (!dual) return new Set<number>()
    return buildIssueIndexSets(issues, scriptText, materialText).material
  }, [dual, issues, scriptText, materialText])

  useEffect(() => {
    if (issues.length === 0) return
    setActiveIssueIndex((i) => Math.min(i, issues.length - 1))
  }, [issues.length])

  useEffect(() => {
    if (!pdfFile && !materialPdfFile) setPdfViewMode("text")
  }, [pdfFile, materialPdfFile])

  /** PdfPagesPanel이 마운트되지 않았거나(추출 텍스트만 보기) 빨리 언마운트돼도 (p.n) 계산 가능하도록 */
  useEffect(() => {
    if (!pdfFile) {
      setMainPdfPageTexts(null)
      return
    }
    setMainPdfPageTexts(null)
    let cancelled = false
    void extractPdfPageTextsArray(pdfFile)
      .then((texts) => {
        if (!cancelled && texts.length > 0) setMainPdfPageTexts(texts)
      })
      .catch(() => {
        if (!cancelled) setMainPdfPageTexts(null)
      })
    return () => {
      cancelled = true
    }
  }, [pdfFile])

  useEffect(() => {
    if (!materialPdfFile) {
      setMaterialPdfPageTexts(null)
      return
    }
    setMaterialPdfPageTexts(null)
    let cancelled = false
    void extractPdfPageTextsArray(materialPdfFile)
      .then((texts) => {
        if (!cancelled && texts.length > 0) setMaterialPdfPageTexts(texts)
      })
      .catch(() => {
        if (!cancelled) setMaterialPdfPageTexts(null)
      })
    return () => {
      cancelled = true
    }
  }, [materialPdfFile])

  const resolvedPdfPagesForIssues = useMemo(() => {
    return issues.map((issue, index) => {
      if (dual) {
        if (!materialPdfFile || !materialPdfPageTexts?.length) return null
        if (!materialIssueIndices.has(index)) return null
        return findPdfPage1BasedForIssue(
          materialPdfPageTexts,
          issue.originalText
        )
      }
      if (!pdfFile || !mainPdfPageTexts?.length) return null
      return findPdfPage1BasedForIssue(mainPdfPageTexts, issue.originalText)
    })
  }, [
    issues,
    dual,
    pdfFile,
    materialPdfFile,
    mainPdfPageTexts,
    materialPdfPageTexts,
    materialIssueIndices,
  ])

  const dualResolvedLocations = useMemo(() => {
    if (!dual) return null
    return issues.map((issue) => {
      const scriptSentence = findSentenceIndex1Based(
        scriptText,
        issue.originalText
      )
      let materialPage: number | null = null
      if (materialPdfFile && materialPdfPageTexts?.length) {
        materialPage = findPdfPage1BasedForIssue(
          materialPdfPageTexts,
          issue.originalText
        )
      }
      if (materialPage == null && materialText.trim().length > 0) {
        materialPage = findSlidePageInMaterialText(
          materialText,
          issue.originalText
        )
      }
      return { scriptSentence, materialPage }
    })
  }, [
    dual,
    issues,
    scriptText,
    materialText,
    materialPdfFile,
    materialPdfPageTexts,
  ])

  const scrollPanelsToIssue = useCallback((issueIndex: number) => {
    sourcePanelRef.current?.scrollToIssue(issueIndex)
    scriptPanelRef.current?.scrollToIssue(issueIndex)
    materialPanelRef.current?.scrollToIssue(issueIndex)
  }, [])

  const expandMobileIssueSheetIfNarrow = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      setMobileIssuesSheetExpanded(true)
    }
  }, [])

  const handleActiveIssueIndexChange = useCallback(
    (idx: number) => {
      expandMobileIssueSheetIfNarrow()
      setActiveIssueIndex(idx)
    },
    [expandMobileIssueSheetIfNarrow]
  )

  const navigateIssue = useCallback(
    (delta: -1 | 1) => {
      if (issues.length === 0) return
      expandMobileIssueSheetIfNarrow()
      setActiveIssueIndex((prev) => {
        const n = issues.length
        const next = (prev + delta + n) % n
        queueMicrotask(() => {
          scrollPanelsToIssue(next)
        })
        return next
      })
    },
    [issues.length, scrollPanelsToIssue, expandMobileIssueSheetIfNarrow]
  )

  const activateIssueFromCard = useCallback(
    (idx: number) => {
      expandMobileIssueSheetIfNarrow()
      setActiveIssueIndex(idx)
      queueMicrotask(() => {
        scrollPanelsToIssue(idx)
      })
    },
    [scrollPanelsToIssue, expandMobileIssueSheetIfNarrow]
  )

  useEffect(() => {
    if (issues.length === 0) return
    const narrow =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    if (narrow && !mobileIssuesSheetExpanded) return

    const el = document.getElementById(`uready-issue-${activeIssueIndex}`)
    if (!el) return

    let cancelled = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        el.scrollIntoView({ behavior: "smooth", block: "nearest" })
        el.classList.add("ring-2", "ring-primary", "ring-offset-2")
        window.setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2")
        }, 1600)
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [activeIssueIndex, mobileIssuesSheetExpanded, issues.length])

  const handleCopy = () => {
    void navigator.clipboard.writeText(
      buildCopyText(analysis, displayFilename, {
        usedNoToolFallback: materialMeta?.usedNoToolFallback === true,
      })
    )
    setToastOpen(true)
    window.setTimeout(() => setToastOpen(false), 3500)
  }

  const headerBlurb =
    issues.length === 0 ? (
      "발견된 항목이 없습니다."
    ) : dual ? (
      <>
        질문 들어오면 막힐 수 있는 부분을 먼저 정리했어요. 이번에는{" "}
        <strong>발표 대본</strong>과 <strong>발표 자료</strong>를 함께 읽고,
        말·화면이 어긋날 때 생기는 취약점도 포함해 검토했습니다.
        <br />
        출처가 약한 주장, 설명이 빈약한 개념, 비교 근거 없는 결론부터
        확인해보세요.
      </>
    ) : (
      <>
        질문 들어오면 막힐 수 있는 부분을 먼저 정리했어요.
        <br />
        출처가 약한 주장, 설명이 빈약한 개념, 비교 근거 없는 결론부터
        확인해보세요.
      </>
    )

  const sectionTitle = dual ? "제출 원문 (대본·자료)" : "제출 원문"

  const renderSingleSourceEmpty = () => (
    <section>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
        {sectionTitle}
      </h3>
      {pdfFile ? (
        <>
          <PdfViewToggle mode={pdfViewMode} onModeChange={setPdfViewMode} />
          {pdfViewMode === "pages" ? (
            <PdfPagesPanel
              ref={sourcePanelRef}
              file={pdfFile}
              issues={issues}
              activeIssueIndex={0}
              onActiveIssueIndexChange={() => {}}
              onNavigateIssue={() => {}}
              onPageTextsReady={setMainPdfPageTexts}
            />
          ) : (
            <SourceTextPanel
              ref={sourcePanelRef}
              sourceText={sourceText}
              issues={issues}
              activeIssueIndex={0}
              onActiveIssueIndexChange={() => {}}
              onNavigateIssue={() => {}}
            />
          )}
        </>
      ) : (
        <SourceTextPanel
          ref={sourcePanelRef}
          sourceText={sourceText}
          issues={issues}
          activeIssueIndex={0}
          onActiveIssueIndexChange={() => {}}
          onNavigateIssue={() => {}}
        />
      )}
    </section>
  )

  const renderDualSourceEmpty = () => (
    <section className="space-y-6">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
        {sectionTitle}
      </h3>
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-600">
          발표 대본
        </h4>
        <SourceTextPanel
          ref={scriptPanelRef}
          sourceText={scriptText}
          issues={issues}
          activeIssueIndex={0}
          onActiveIssueIndexChange={() => {}}
          onNavigateIssue={() => {}}
        />
      </div>
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-600">
          발표 자료
          {materialFilename ? (
            <span className="ml-1 font-normal text-uready-gray-500">
              ({materialFilename})
            </span>
          ) : null}
        </h4>
        {materialPdfFile ? (
          <>
            <PdfViewToggle mode={pdfViewMode} onModeChange={setPdfViewMode} />
            {pdfViewMode === "pages" ? (
              <PdfPagesPanel
                ref={materialPanelRef}
                file={materialPdfFile}
                issues={issues}
                activeIssueIndex={0}
                onActiveIssueIndexChange={() => {}}
                onNavigateIssue={() => {}}
                onPageTextsReady={setMaterialPdfPageTexts}
              />
            ) : (
              <SourceTextPanel
                ref={materialPanelRef}
                sourceText={materialText}
                issues={issues}
                activeIssueIndex={0}
                onActiveIssueIndexChange={() => {}}
                onNavigateIssue={() => {}}
              />
            )}
          </>
        ) : (
          <SourceTextPanel
            ref={materialPanelRef}
            sourceText={materialText}
            issues={issues}
            activeIssueIndex={0}
            onActiveIssueIndexChange={() => {}}
            onNavigateIssue={() => {}}
          />
        )}
      </div>
    </section>
  )

  const renderSingleSourceWithIssues = () => (
    <section className="order-1 md:sticky md:top-28 md:max-h-[calc(100vh-7rem)] md:self-start">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
        {sectionTitle}
      </h3>
      {pdfFile ? (
        <>
          <PdfViewToggle mode={pdfViewMode} onModeChange={setPdfViewMode} />
          <p className="mb-3 text-xs leading-relaxed text-uready-gray-500">
            {pdfViewMode === "pages"
              ? "◀ ▶ 로 허점을 바꾸면 인용이 있을 법한 페이지로 스크롤됩니다. 문장 하이라이트는 「추출 텍스트」에서 보세요."
              : "위 ◀ ▶ 로 허점 번호를 바꿀 수 있어요. 하이라이트·허점 카드를 누르면 해당 위치로 스크롤됩니다."}
          </p>
          {pdfViewMode === "pages" ? (
            <PdfPagesPanel
              ref={sourcePanelRef}
              file={pdfFile}
              issues={issues}
              activeIssueIndex={activeIssueIndex}
              onActiveIssueIndexChange={handleActiveIssueIndexChange}
              onNavigateIssue={navigateIssue}
              onPageTextsReady={setMainPdfPageTexts}
            />
          ) : (
            <SourceTextPanel
              ref={sourcePanelRef}
              sourceText={sourceText}
              issues={issues}
              activeIssueIndex={activeIssueIndex}
              onActiveIssueIndexChange={handleActiveIssueIndexChange}
              onNavigateIssue={navigateIssue}
            />
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-xs leading-relaxed text-uready-gray-500">
            위 ◀ ▶ 로 허점 번호를 바꿀 수 있어요. 하이라이트·허점 카드를
            누르면 서로 해당 위치로 스크롤됩니다.
          </p>
          <SourceTextPanel
            ref={sourcePanelRef}
            sourceText={sourceText}
            issues={issues}
            activeIssueIndex={activeIssueIndex}
            onActiveIssueIndexChange={handleActiveIssueIndexChange}
            onNavigateIssue={navigateIssue}
          />
        </>
      )}
    </section>
  )

  const renderDualSourceWithIssues = () => (
    <section className="order-1 md:sticky md:top-28 md:max-h-[calc(100vh-7rem)] md:self-start">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
        {sectionTitle}
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-uready-gray-500">
        ◀ ▶ 로 허점을 바꾸면 대본·자료 각각에서 해당 인용으로 스크롤됩니다.
      </p>
      <IssueNavigatorRow
        n={issues.length}
        activeIssueIndex={activeIssueIndex}
        onNavigateIssue={navigateIssue}
      />
      <div className="space-y-4">
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-600">
            발표 대본
          </h4>
          {/* 대본: script/material 분류와 무관하게, 인용이 대본에 있으면 모두 하이라이트 */}
          <SourceTextPanel
            ref={scriptPanelRef}
            sourceText={scriptText}
            issues={issues}
            activeIssueIndex={activeIssueIndex}
            onActiveIssueIndexChange={handleActiveIssueIndexChange}
            onNavigateIssue={navigateIssue}
            showIssueNavigator={false}
          />
        </div>
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-600">
            발표 자료
            {materialFilename ? (
              <span className="ml-1 font-normal text-uready-gray-500">
                ({materialFilename})
              </span>
            ) : null}
          </h4>
          {materialPdfFile ? (
            <>
              <PdfViewToggle mode={pdfViewMode} onModeChange={setPdfViewMode} />
              <p className="mb-3 text-xs leading-relaxed text-uready-gray-500">
                {pdfViewMode === "pages"
                  ? "페이지 보기에서는 인용이 있을 법한 쪽으로 스크롤됩니다. 하이라이트는 「추출 텍스트」에서 보세요."
                  : "자료 본문에서 인용이 맞는 구간이 하이라이트됩니다."}
              </p>
              {pdfViewMode === "pages" ? (
                <PdfPagesPanel
                  ref={materialPanelRef}
                  file={materialPdfFile}
                  issues={issues}
                  activeIssueIndex={activeIssueIndex}
                  onActiveIssueIndexChange={handleActiveIssueIndexChange}
                  onNavigateIssue={navigateIssue}
                  showIssueNavigator={false}
                  onPageTextsReady={setMaterialPdfPageTexts}
                />
              ) : (
                <SourceTextPanel
                  ref={materialPanelRef}
                  sourceText={materialText}
                  issues={issues}
                  activeIssueIndex={activeIssueIndex}
                  onActiveIssueIndexChange={handleActiveIssueIndexChange}
                  onNavigateIssue={navigateIssue}
                  showIssueNavigator={false}
                  highlightIssueIndices={materialIssueIndices}
                />
              )}
            </>
          ) : (
            <SourceTextPanel
              ref={materialPanelRef}
              sourceText={materialText}
              issues={issues}
              activeIssueIndex={activeIssueIndex}
              onActiveIssueIndexChange={handleActiveIssueIndexChange}
              onNavigateIssue={navigateIssue}
              showIssueNavigator={false}
              highlightIssueIndices={materialIssueIndices}
            />
          )}
        </div>
      </div>
    </section>
  )

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SharedNav
        variant="results"
        onLogoClick={onLogoClick}
        right={
          <>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-md border border-uready-gray-200 bg-transparent px-4 py-1.5 text-[13px] font-semibold text-uready-gray-700 transition-colors hover:bg-uready-gray-100"
            >
              🔄 다른 자료 분석하기
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-uready-red bg-uready-red px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:border-uready-red-dark hover:bg-uready-red-dark"
            >
              📥 분석 결과 복사하기
            </button>
          </>
        }
      />

      <div className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-uready-gray-200 bg-white px-4 sm:px-8">
        <div className="flex items-center gap-1.5 text-[13px] text-uready-gray-500">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <strong className="font-semibold text-uready-gray-700">
            {displayFilename}
          </strong>
          <span>· 분석 완료</span>
        </div>
      </div>

      <div
        className={cn(
          "mx-auto w-full max-w-[1100px] flex-1 px-4 py-10 pb-24 sm:px-6 sm:pb-28",
          issues.length > 0 && "max-md:pb-36"
        )}
      >
        <header className="mb-8">
          <h2 className="mb-1.5 text-2xl font-extrabold tracking-tight text-uready-gray-900">
            발표 전에 꼭 확인할 부분
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-uready-gray-500">
            {headerBlurb}
          </p>
        </header>

        {materialMeta?.usedChunkedAnalysis &&
        materialMeta.chunkCount != null ? (
          <div
            className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
            role="status"
          >
            <p className="m-0 font-semibold">긴 문서를 구간 나누어 분석했습니다</p>
            <p className="mt-1.5 mb-0 leading-relaxed text-sky-900/90">
              원문{" "}
              <strong>
                {materialMeta.charLengthOriginal.toLocaleString("ko-KR")}자
              </strong>
              를 한 번에 넣을 수 있는 한도(
              <strong>
                {materialMeta.maxChars.toLocaleString("ko-KR")}자
              </strong>
              )를 넘어,{" "}
              <strong>{materialMeta.chunkCount}개</strong> 구간으로 나눠 순차
              분석했습니다. 구간 경계 근처에서 비슷한 항목이 있으면 하나로
              합쳐 표시될 수 있습니다. 소요 시간이 더 길어질 수 있습니다.
            </p>
          </div>
        ) : null}

        {materialMeta?.usedNoToolFallback ? (
          <div
            className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950"
            role="status"
          >
            <p className="m-0 font-semibold">웹 검색 없이 분석되었습니다</p>
            <p className="mt-1.5 mb-0 leading-relaxed text-violet-900/90">
              웹 검색·외부 출처는 사용하지 않았습니다. 위치·원문 문장은 제출
              자료만 기준으로 표시되며, 수치·주장은 발표 전에 직접 확인하는 것이
              좋습니다.
            </p>
          </div>
        ) : null}

        {materialMeta?.truncatedForModel ? (
          <div
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
          >
            <p className="m-0 font-semibold">본문이 분석 상한에서 잘렸습니다</p>
            <p className="mt-1.5 mb-0 leading-relaxed text-amber-900/90">
              모델에는 최대{" "}
              <strong>{materialMeta.maxChars.toLocaleString("ko-KR")}자</strong>
              까지 전달됩니다. 이번 원문은{" "}
              <strong>
                {materialMeta.charLengthOriginal.toLocaleString("ko-KR")}자
              </strong>
              이므로 앞{" "}
              <strong>
                {materialMeta.charLengthSentToModel.toLocaleString("ko-KR")}자
              </strong>
              만 반영되었습니다. PDF 뒷부분이 빠진 것처럼 보일 수 있습니다.
            </p>
          </div>
        ) : null}

        {issues.length === 0 ? (
          <div className="space-y-8">
            {dual ? renderDualSourceEmpty() : renderSingleSourceEmpty()}
            <p className="rounded-2xl border border-dashed border-uready-gray-200 bg-uready-gray-50 px-6 py-14 text-center text-sm text-uready-gray-600">
              눈에 띄는 허점이 발견되지 않았어요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 pb-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:items-start md:gap-12 md:pb-4">
            {dual ? renderDualSourceWithIssues() : renderSingleSourceWithIssues()}
            <section
              className={cn(
                "order-2 min-w-0",
                "max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-40"
              )}
            >
              <div
                className={cn(
                  "mx-auto flex min-h-0 w-full max-w-[1100px] flex-col overflow-hidden px-4 sm:px-6 md:px-0",
                  "max-md:rounded-t-2xl max-md:border max-md:border-b-0 max-md:border-uready-gray-200 max-md:bg-white max-md:shadow-[0_-8px_32px_rgba(0,0,0,0.08)]",
                  mobileIssuesSheetExpanded
                    ? "max-md:max-h-[50vh]"
                    : "max-md:max-h-14"
                )}
              >
                <button
                  type="button"
                  className="flex w-full shrink-0 items-center justify-between gap-3 border-b border-uready-gray-200/90 py-3 text-left md:hidden"
                  aria-expanded={mobileIssuesSheetExpanded}
                  aria-controls="uready-issues-sheet-list"
                  onClick={() => setMobileIssuesSheetExpanded((e) => !e)}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                    점검할 부분
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <span className="text-sm font-semibold tabular-nums text-uready-gray-800">
                      허점 {activeIssueIndex + 1} / {issues.length}
                    </span>
                    <span className="text-uready-gray-500" aria-hidden>
                      {mobileIssuesSheetExpanded ? "▼" : "▲"}
                    </span>
                  </span>
                </button>

                <h3 className="mb-4 hidden text-xs font-bold uppercase tracking-wide text-uready-gray-500 md:block">
                  점검할 부분
                </h3>

                <ul
                  id="uready-issues-sheet-list"
                  className={cn(
                    "m-0 list-none space-y-5 p-0",
                    "max-md:min-h-0 max-md:overflow-y-auto max-md:overscroll-y-contain max-md:pb-[max(1rem,env(safe-area-inset-bottom))]",
                    !mobileIssuesSheetExpanded && "max-md:hidden",
                    mobileIssuesSheetExpanded &&
                      "max-md:flex-1 max-md:[scrollbar-gutter:stable]"
                  )}
                >
                  {issues.map((issue, index) => (
                    <IssueCard
                      key={`${issue.location}-${index}`}
                      issue={issue}
                      index={index}
                      resolvedPdfPage={
                        dual ? null : resolvedPdfPagesForIssues[index]
                      }
                      dualSourceMode={dual}
                      dualScriptSentence={
                        dualResolvedLocations?.[index]?.scriptSentence ?? null
                      }
                      dualMaterialPage={
                        dualResolvedLocations?.[index]?.materialPage ?? null
                      }
                      usedNoToolFallback={
                        materialMeta?.usedNoToolFallback === true
                      }
                      onActivate={activateIssueFromCard}
                    />
                  ))}
                </ul>
              </div>
            </section>
          </div>
        )}

        <p
          className={cn(
            "border-t border-uready-gray-100 text-xs font-semibold leading-relaxed text-primary sm:text-sm",
            "mt-16 scroll-mt-8 pt-10 md:mt-20 md:pt-12"
          )}
        >
          💾 새로고침 시 데이터가 삭제되니 그 전에 우측 상단 버튼을 눌러 분석
          결과를 저장해두세요.
        </p>
      </div>

      <div
        className={`fixed bottom-8 left-1/2 z-[1000] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-uready-gray-900 px-5 py-3 text-center text-sm font-medium text-white shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] whitespace-normal sm:whitespace-nowrap ${
          toastOpen
            ? "translate-y-0"
            : "pointer-events-none translate-y-20 opacity-0"
        }`}
        role="status"
      >
        내용이 복사되었어요. 꼭 보완해서 자신있게 발표하세요! 🎤
      </div>
    </div>
  )
}
