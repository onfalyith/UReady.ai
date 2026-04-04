"use client"

import { useState } from "react"
import { SharedNav } from "./shared-nav"
import type { UReadyIssue, RiskLevel } from "@/lib/uready/types"

type ResultScreenProps = {
  displayFilename: string
  issues: UReadyIssue[]
  onReset: () => void
  onCopy: (issues: UReadyIssue[], displayFilename: string) => void
  onLogoClick: () => void
}

function riskBadgeClass(risk: RiskLevel) {
  if (risk === "high") return "bg-uready-pink-light text-uready-red"
  if (risk === "medium") return "bg-uready-amber-light text-uready-amber"
  return "bg-uready-blue-light text-uready-blue"
}

function riskLabel(risk: RiskLevel) {
  if (risk === "high") return "HIGH RISK"
  if (risk === "medium") return "MEDIUM"
  return "LOW"
}

export function ResultScreen({
  displayFilename,
  issues,
  onReset,
  onCopy,
  onLogoClick,
}: ResultScreenProps) {
  const [toastOpen, setToastOpen] = useState(false)

  const handleCopy = () => {
    onCopy(issues, displayFilename)
    setToastOpen(true)
    window.setTimeout(() => setToastOpen(false), 3500)
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SharedNav
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

      <div className="mx-auto w-full max-w-[820px] flex-1 px-4 py-10 pb-20 sm:px-6">
        <header className="mb-8">
          <h2 className="mb-1.5 text-2xl font-extrabold tracking-tight text-uready-gray-900">
            📋 분석 결과
          </h2>
          <p className="text-sm text-uready-gray-500">
            총{" "}
            <strong className="font-bold text-uready-red">
              {issues.length}개
            </strong>
            의 허점이 발견됐어요. 발표 전에 점검해보세요.
          </p>
        </header>

        {/* 카드 리스트 — API 연동 시 issues.map */}
        <ul className="list-none space-y-5 p-0">
          {issues.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-uready-gray-200 bg-uready-gray-50 px-6 py-12 text-center text-sm text-uready-gray-500">
              아직 표시할 허점 카드가 없습니다. 분석 API를 연결하면 이 영역에
              카드가 채워집니다.
            </li>
          ) : (
            issues.map((issue, index) => (
              <li
                key={issue.id}
                className="overflow-hidden rounded-2xl border border-uready-gray-200 bg-white shadow-uready-sm"
              >
                <div className="flex flex-wrap items-center gap-2.5 border-b border-uready-gray-100 px-[22px] pb-3.5 pt-[18px]">
                  <span className="text-xs font-bold uppercase tracking-wide text-uready-gray-400">
                    📌 허점 #{index + 1}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${riskBadgeClass(issue.risk)}`}
                  >
                    {riskLabel(issue.risk)}
                  </span>
                  <span className="text-xs text-uready-gray-500">
                    {issue.categoryLabel}
                  </span>
                </div>
                <div className="px-[22px] py-5">
                  <section className="mb-5">
                    <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                      원문 내용
                    </div>
                    <blockquote className="rounded-r-md border-l-[3px] border-highlight bg-uready-gray-50 py-3.5 pl-4 pr-4 text-sm italic leading-relaxed text-uready-gray-700">
                      &quot;{issue.quote}&quot;
                    </blockquote>
                  </section>

                  <div className="my-[18px] h-px bg-uready-gray-100" />

                  <section className="mb-5">
                    <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                      ⚠️ 논리적 취약점 / 예상 반론
                    </div>
                    <p className="text-sm leading-loose text-uready-gray-700">
                      {issue.vulnerabilityText}
                    </p>
                  </section>

                  <div className="my-[18px] h-px bg-uready-gray-100" />

                  <section className="mb-5">
                    <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                      💡 이유
                    </div>
                    <div className="rounded-[10px] bg-uready-gray-50 px-4 py-3.5 text-sm leading-relaxed text-uready-gray-700">
                      {issue.reason}
                    </div>
                  </section>

                  <div className="my-[18px] h-px bg-uready-gray-100" />

                  <section>
                    <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-uready-gray-500">
                      🧭 개선 방향 (스스로 점검해보세요)
                    </div>
                    <ul className="flex list-none flex-col gap-2.5 p-0">
                      {issue.improvementQuestions.map((q, i) => (
                        <li
                          key={`${issue.id}-q-${i}`}
                          className="flex gap-2.5 text-sm leading-relaxed text-uready-gray-700 before:mt-0.5 before:shrink-0 before:font-bold before:text-uready-red before:content-['→']"
                        >
                          {q}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </li>
            ))
          )}
        </ul>

        <footer className="mt-12 rounded-[10px] border border-uready-gray-200 bg-uready-gray-50 p-5">
          <div className="flex gap-2 text-xs leading-relaxed text-uready-gray-500">
            <span className="shrink-0 text-uready-amber" aria-hidden>
              ⚠️
            </span>
            <span>
              AI의 검증 결과는 완벽하지 않을 수 있으며, 부정확한 정보가 포함될 수
              있습니다.
            </span>
          </div>
          <div className="mt-2 flex gap-2 text-xs leading-relaxed text-uready-gray-500">
            <span className="shrink-0 text-uready-amber" aria-hidden>
              ⚠️
            </span>
            <span>
              정보의 최종적인 사실 확인 및 발표 결과에 대한 모든 책임은 사용자
              본인에게 있습니다. 민감한 정보(개인정보, 대외비 등)는 입력하지
              마세요.
            </span>
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-uready-red">
            💾 새로고침 시 데이터가 삭제되며 메인 화면으로 이동합니다.
          </p>
        </footer>
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
