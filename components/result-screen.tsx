"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SharedNav } from "@/components/uready/shared-nav"
import { IssueCard } from "@/components/issue-card"
import {
  SourceTextPanel,
  type SourceTextPanelHandle,
} from "@/components/source-text-panel"
import type { AnalysisMaterialMeta } from "@/lib/ai/schema"
import type { PresentationAnalysis } from "@/types/analysis"

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
  /** 분석에 사용된 TXT/PDF·직접 입력 원문 전체 */
  sourceText: string
  analysis: PresentationAnalysis
  materialMeta: AnalysisMaterialMeta | null
  onReset: () => void
  onLogoClick: () => void
}

export function ResultScreen({
  displayFilename,
  sourceText,
  analysis,
  materialMeta,
  onReset,
  onLogoClick,
}: ResultScreenProps) {
  const [toastOpen, setToastOpen] = useState(false)
  const issues = analysis.issues
  const sourcePanelRef = useRef<SourceTextPanelHandle>(null)
  const [activeIssueIndex, setActiveIssueIndex] = useState(0)

  useEffect(() => {
    if (issues.length === 0) return
    setActiveIssueIndex((i) => Math.min(i, issues.length - 1))
  }, [issues.length])

  const navigateIssue = useCallback(
    (delta: -1 | 1) => {
      if (issues.length === 0) return
      setActiveIssueIndex((prev) => {
        const n = issues.length
        const next = (prev + delta + n) % n
        queueMicrotask(() => {
          sourcePanelRef.current?.scrollToIssue(next)
          document
            .getElementById(`uready-issue-${next}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        })
        return next
      })
    },
    [issues.length]
  )

  const activateIssueFromCard = useCallback((idx: number) => {
    setActiveIssueIndex(idx)
    queueMicrotask(() => {
      sourcePanelRef.current?.scrollToIssue(idx)
    })
  }, [])

  const handleCopy = () => {
    void navigator.clipboard.writeText(
      buildCopyText(analysis, displayFilename, {
        usedNoToolFallback: materialMeta?.usedNoToolFallback === true,
      })
    )
    setToastOpen(true)
    window.setTimeout(() => setToastOpen(false), 3500)
  }

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

      <div className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-10 pb-20 sm:px-6">
        <header className="mb-8">
          <h2 className="mb-1.5 text-2xl font-extrabold tracking-tight text-uready-gray-900">
            발표 전에 꼭 확인할 부분
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-uready-gray-500">
            {issues.length === 0 ? (
              "발견된 항목이 없습니다."
            ) : (
              <>
                질문 들어오면 막힐 수 있는 부분을 먼저 정리했어요.
                <br />
                출처가 약한 주장, 설명이 빈약한 개념, 비교 근거 없는 결론부터
                확인해보세요. 원문 ◀ ▶ 로 넘기거나, 카드·하이라이트를 눌러
                이동할 수 있어요.
              </>
            )}
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
            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                제출 원문
              </h3>
              <SourceTextPanel
                ref={sourcePanelRef}
                sourceText={sourceText}
                issues={issues}
                activeIssueIndex={0}
                onActiveIssueIndexChange={() => {}}
                onNavigateIssue={() => {}}
              />
            </section>
            <p className="rounded-2xl border border-dashed border-uready-gray-200 bg-uready-gray-50 px-6 py-14 text-center text-sm text-uready-gray-600">
              눈에 띄는 허점이 발견되지 않았어요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-12">
            <section className="order-1 lg:sticky lg:top-28 lg:max-h-[calc(100vh-7rem)] lg:self-start">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                제출 원문
              </h3>
              <p className="mb-3 text-xs leading-relaxed text-uready-gray-500">
                위 ◀ ▶ 로 허점 번호를 바꿀 수 있어요. 하이라이트·허점 카드를
                누르면 서로 해당 위치로 스크롤됩니다.
              </p>
              <SourceTextPanel
                ref={sourcePanelRef}
                sourceText={sourceText}
                issues={issues}
                activeIssueIndex={activeIssueIndex}
                onActiveIssueIndexChange={setActiveIssueIndex}
                onNavigateIssue={navigateIssue}
              />
            </section>
            <section className="order-2 min-w-0">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                점검할 부분
              </h3>
              <ul className="m-0 list-none space-y-5 p-0">
                {issues.map((issue, index) => (
                  <IssueCard
                    key={`${issue.location}-${index}`}
                    issue={issue}
                    index={index}
                    usedNoToolFallback={materialMeta?.usedNoToolFallback === true}
                    onActivate={activateIssueFromCard}
                  />
                ))}
              </ul>
            </section>
          </div>
        )}

        <p className="mt-12 text-xs font-semibold leading-relaxed text-primary sm:text-sm">
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
