"use client"

import type { PresentationIssue } from "@/types/analysis"
import { EvidenceList } from "@/components/evidence-list"
import { filterSubstantiveEvidence } from "@/lib/uready/evidence-ui"

function sourceTrustNotice(
  level: PresentationIssue["sourceReliability"]
): string | null {
  if (level === "low_credibility") {
    return "(근거 자료 출처의 신뢰도가 낮습니다)"
  }
  if (level === "unverified") {
    return "(근거 자료의 출처가 확인되지 않습니다)"
  }
  return null
}

/** 노툴 폴백: 원문은 originalText 우선(스키마 더미 evidence는 UI에 안 씀) */
function noToolQuotationText(issue: PresentationIssue): string {
  const ot = issue.originalText?.trim()
  if (!ot || ot === "(원문 인용 없음)") return "—"
  if (ot === "-" || ot === "—" || ot === "–") return "—"
  return issue.originalText
}

/** 모델이 시스템 지시를 location에 붙여 넣은 경우 */
function looksLikeInstructionalLocation(s: string): boolean {
  if (s.length > 160) return true
  const markers = [
    "페이지 번호가 있으면",
    "아래에 붙은",
    "반드시 채우",
    "문장·문단 순번",
    "코드 펜스",
    "순수 JSON",
    "originalText",
    "location 필드",
    "지시문을",
    "한 줄짜리 위치",
  ]
  return markers.some((m) => s.includes(m))
}

function noToolLocationText(issue: PresentationIssue): string {
  const loc = issue.location?.trim()
  if (!loc || loc === "—") return "—"
  if (looksLikeInstructionalLocation(loc)) return "—"
  return issue.location
}

type IssueCardProps = {
  issue: PresentationIssue
  index: number
  usedNoToolFallback?: boolean
  /** PDF 원문과 인용이 매칭되면 1-based 페이지 (p. n) — 단일 원문·이중 원문의 자료 PDF는 dualMaterialPage 사용 */
  resolvedPdfPage?: number | null
  /** 대본+자료 동시 분석: 위치를 각각 표시 */
  dualSourceMode?: boolean
  /** 발표 대본에서 인용 문장의 전체 기준 순번 */
  dualScriptSentence?: number | null
  /** 발표 자료: PDF면 페이지, 텍스트면 슬라이드 헤더·추정 번호 */
  dualMaterialPage?: number | null
  /** 카드 본문 클릭 시 원문 하이라이트로 스크롤(링크·내부 버튼 제외) */
  onActivate?: (index: number) => void
}

export function IssueCard({
  issue,
  index,
  usedNoToolFallback = false,
  resolvedPdfPage = null,
  dualSourceMode = false,
  dualScriptSentence = null,
  dualMaterialPage = null,
  onActivate,
}: IssueCardProps) {
  const trustNotice =
    usedNoToolFallback ? null : sourceTrustNotice(issue.sourceReliability)

  const substantiveEvidence = filterSubstantiveEvidence(issue.evidence)

  const dualLocationModelNote =
    !usedNoToolFallback && issue.location?.trim() ? issue.location.trim() : ""
  const dualHasResolvedScript = dualScriptSentence != null
  const dualHasResolvedMaterial = dualMaterialPage != null
  const dualShowLocationSection =
    !dualSourceMode ||
    dualHasResolvedScript ||
    dualHasResolvedMaterial ||
    dualLocationModelNote.length > 0

  return (
    <li
      id={`uready-issue-${index}`}
      className={`scroll-mt-28 overflow-hidden rounded-2xl border border-uready-gray-200 bg-white shadow-uready-sm transition-shadow duration-300 ${
        onActivate ? "cursor-pointer" : ""
      }`}
      onClick={
        onActivate
          ? (e) => {
              const t = e.target as HTMLElement
              if (t.closest("a[href], button")) return
              onActivate(index)
            }
          : undefined
      }
    >
      <div className="border-b border-uready-gray-100 px-[22px] py-3.5">
        <span className="text-xs font-bold uppercase tracking-wide text-uready-gray-400">
          허점 #{index + 1}
        </span>
      </div>

      <div className="px-[22px] py-5">
        {dualShowLocationSection ? (
          <section className="mb-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
              위치
            </h3>
            {dualSourceMode ? (
              <div className="space-y-3 text-sm text-uready-gray-800">
                {dualHasResolvedScript ? (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-uready-gray-500">
                      발표 대본
                    </p>
                    <p className="mt-1 leading-relaxed">
                      전체 기준 {dualScriptSentence}번째 문장
                    </p>
                  </div>
                ) : null}
                {dualHasResolvedMaterial ? (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-uready-gray-500">
                      발표 자료
                    </p>
                    <p className="mt-1 leading-relaxed">
                      슬라이드·페이지 {dualMaterialPage}
                    </p>
                  </div>
                ) : null}
                {dualLocationModelNote ? (
                  <p className="text-[12px] leading-relaxed text-uready-gray-500">
                    모델 표기: {dualLocationModelNote}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-uready-gray-800">
                {usedNoToolFallback ? noToolLocationText(issue) : issue.location}
                {resolvedPdfPage != null ? (
                  <span className="whitespace-nowrap text-uready-gray-500">
                    {" "}
                    (p. {resolvedPdfPage})
                  </span>
                ) : null}
              </p>
            )}
          </section>
        ) : null}

        <div className="my-4 h-px bg-uready-gray-100" />

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            발표에 들어간 문장
          </h3>
          <p className="rounded-r-md border-l-[3px] border-primary bg-highlight px-4 py-3.5 text-sm font-bold leading-relaxed text-uready-gray-900">
            {usedNoToolFallback ? noToolQuotationText(issue) : issue.originalText}
          </p>
        </section>

        <div className="my-4 h-px bg-uready-gray-100" />

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            왜 이 부분이 위험한가
          </h3>
          <p className="text-sm leading-loose text-uready-gray-700">
            {issue.categoryCheck}
          </p>
        </section>

        <div className="my-4 h-px bg-uready-gray-100" />

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            왜 질문이 들어올 수 있나
          </h3>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-uready-gray-400">
            논리적 취약점
          </p>
          <p className="text-sm leading-loose text-uready-gray-700">
            {issue.logicalWeakness}
          </p>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-uready-gray-400">
            예상 반론
          </p>
          <p className="text-sm leading-loose text-uready-gray-700">
            {issue.counterArgument}
          </p>
        </section>

        <div className="my-4 h-px bg-uready-gray-100" />

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            발표 전에 이렇게 확인해보세요
          </h3>
          <div className="rounded-[10px] border border-primary/25 bg-uready-red-light px-4 py-3.5 text-sm font-medium leading-relaxed text-uready-gray-900">
            {issue.improvementQuestion}
          </div>
        </section>

        {trustNotice ? (
          <>
            <div className="my-4 h-px bg-uready-gray-100" />
            <section className="mb-5">
              <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-relaxed text-amber-950">
                {trustNotice}
              </p>
            </section>
          </>
        ) : null}

        {substantiveEvidence.length > 0 ? (
          <EvidenceList items={substantiveEvidence} />
        ) : null}
      </div>
    </li>
  )
}
