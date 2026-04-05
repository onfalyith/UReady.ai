"use client"

import type { PresentationIssue } from "@/types/analysis"
import { EvidenceList } from "@/components/evidence-list"

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
}

export function IssueCard({
  issue,
  index,
  usedNoToolFallback = false,
}: IssueCardProps) {
  const trustNotice =
    usedNoToolFallback ? null : sourceTrustNotice(issue.sourceReliability)

  return (
    <li className="overflow-hidden rounded-2xl border border-uready-gray-200 bg-white shadow-uready-sm">
      <div className="border-b border-uready-gray-100 px-[22px] py-3.5">
        <span className="text-xs font-bold uppercase tracking-wide text-uready-gray-400">
          허점 #{index + 1}
        </span>
      </div>

      <div className="px-[22px] py-5">
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            위치
          </h3>
          <p className="text-sm text-uready-gray-800">
            {usedNoToolFallback ? noToolLocationText(issue) : issue.location}
          </p>
        </section>

        <div className="my-4 h-px bg-uready-gray-100" />

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            원문 문장
          </h3>
          <p className="rounded-r-md border-l-[3px] border-primary bg-highlight px-4 py-3.5 text-sm font-bold leading-relaxed text-uready-gray-900">
            {usedNoToolFallback ? noToolQuotationText(issue) : issue.originalText}
          </p>
        </section>

        <div className="my-4 h-px bg-uready-gray-100" />

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            논리적 취약점
          </h3>
          <p className="text-sm leading-loose text-uready-gray-700">
            {issue.logicalWeakness}
          </p>
        </section>

        <div className="my-4 h-px bg-uready-gray-100" />

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            반론
          </h3>
          <p className="text-sm leading-loose text-uready-gray-700">
            {issue.counterArgument}
          </p>
        </section>

        <div className="my-4 h-px bg-uready-gray-100" />

        <section className="mb-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
            개선 방향
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

        {!usedNoToolFallback ? (
          <>
            <div className="my-4 h-px bg-uready-gray-100" />
            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                출처 및 근거
              </h3>
              <EvidenceList items={issue.evidence} />
            </section>
          </>
        ) : null}
      </div>
    </li>
  )
}
