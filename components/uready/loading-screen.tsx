"use client"

import { useEffect, useState } from "react"

type LoadingScreenProps = {
  displayFilename: string
  onLogoClick: () => void
  /** 심층 점검(4단계) 안내 */
  deepInspectionMode?: boolean
}

const LOG_LINES = [
  "[시스템] 문서 본문을 불러왔습니다.",
  "[분석] 의미 단위로 구간을 나누는 중…",
  "[검색] 주요 수치·주장을 웹에서 교차 확인 중…",
  "[모델] 논리 허점·반론 후보를 정리하는 중…",
  "[출력] 리포트 카드 형식으로 묶는 중…",
]

const INSIGHT_ROTATION_MS = 5_000

const INSIGHT_MESSAGES = [
  "🤔 발표에서 막히는 건 보통 틀린 정보보다, 내가 설명 못하는 문장입니다",
  "📊 수치나 단정적인 표현은 질문이 들어올 확률이 높습니다",
  "🙊 그럴듯한 문장일수록 “왜요?”라는 질문 앞에서 막히기 쉽습니다",
  "👀 지금은 위험한 주장과 설명이 빈약한 부분을 먼저 보고 있어요",
] as const

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  )
}

export function LoadingScreen({
  displayFilename,
  onLogoClick,
  deepInspectionMode = false,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [visibleLogCount, setVisibleLogCount] = useState(1)
  const [insightIndex, setInsightIndex] = useState(0)

  /**
   * 진행률은 실제 API 완료와 무관한 시간 기준 추정치입니다.
   * 이전 구현은 t = min(1, elapsed/42s)로 42초 이후 t가 고정되어
   * (1 - e^(-2.8)) ≈ 0.94 → 약 84%에서 영원히 멈춘 것처럼 보였습니다.
   * → 초반 42초는 기존 곡선 유지, 이후에는 별도 완화로 84→94%까지 천천히 상승.
   */
  useEffect(() => {
    const start = Date.now()
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start
      const phase1Ms = 42_000
      let p: number
      if (elapsed <= phase1Ms) {
        const t = elapsed / phase1Ms
        const eased = 1 - Math.exp(-t * 2.8)
        p = Math.floor(eased * 90)
      } else {
        const extra = elapsed - phase1Ms
        const eased = 1 - Math.exp(-extra / 95_000)
        p = Math.min(94, 84 + Math.floor(eased * 10))
      }
      setProgress(p)
    }, 160)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let n = 1
    const id = window.setInterval(() => {
      n = Math.min(LOG_LINES.length, n + 1)
      setVisibleLogCount(n)
      if (n >= LOG_LINES.length) window.clearInterval(id)
    }, 2200)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      setInsightIndex((i) => (i + 1) % INSIGHT_MESSAGES.length)
    }, INSIGHT_ROTATION_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      id="screen-loading"
      className="flex min-h-screen flex-col bg-uready-gray-50"
    >
      <nav className="flex h-14 shrink-0 items-center border-b border-uready-gray-200 bg-white px-4 sm:px-8">
        <button
          type="button"
          onClick={onLogoClick}
          className="logo flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
        >
          <div className="logo-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-uready-red text-base font-black tracking-tight text-white">
            U
          </div>
          <span className="logo-text text-[17px] font-bold tracking-tight text-uready-gray-900">
            Ready<span className="text-uready-red">.ai</span>
          </span>
        </button>
      </nav>

      <div className="loading-body flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="loading-card w-full max-w-[520px] rounded-2xl border border-uready-gray-200 bg-white px-8 py-9 text-center shadow-uready-lg sm:px-10 sm:py-10">
          <div className="loading-icon-wrap mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-[18px] bg-uready-red-light text-primary">
            <DocumentIcon className="h-10 w-10" />
          </div>

          <div className="loading-title text-[19px] font-extrabold tracking-tight text-uready-gray-900 sm:text-[21px]">
            발표 중 막힐 수 있는 부분을 찾고 있어요
          </div>
          <div
            className="loading-filename mt-2 text-[13px] text-uready-gray-500"
            id="loading-filename"
          >
            {displayFilename}
          </div>
          {deepInspectionMode ? (
            <p className="mt-2 text-[12px] font-medium text-primary">
              심층 점검 모드: 맥락 추출 → 팩트체크 → 소크라테스 초안 → 최종
              통합(4단계) 진행 중입니다. 잠시만 기다려 주세요.
            </p>
          ) : null}

          <div className="progress-bar-wrap mt-8">
            <div className="progress-track h-2 overflow-hidden rounded-full bg-uready-gray-200">
              <div
                className="progress-fill h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                id="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="progress-label mt-2 text-center">
              <span
                className="text-[11px] font-semibold tracking-wide text-uready-gray-400"
                id="progress-label"
              >
                {progress}% COMPLETE
              </span>
            </div>
          </div>

          <p
            className="insight-text mt-8 min-h-[4.5rem] text-left text-[13px] leading-relaxed whitespace-pre-line text-uready-gray-600"
            id="insight-text"
            aria-live="polite"
          >
            {INSIGHT_MESSAGES[insightIndex]}
          </p>

          <div
            className="log-box mt-5 min-h-[100px] rounded-xl border border-uready-gray-200 bg-uready-gray-50 px-4 py-3 text-left"
            id="log-box"
          >
            <ul className="space-y-1.5 font-mono text-[11px] leading-snug text-uready-gray-500">
              {LOG_LINES.slice(0, visibleLogCount).map((line, i) => (
                <li key={i} className="animate-in fade-in-0 duration-300">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p className="loading-hint mt-6 text-[12px] text-uready-gray-400">
            브라우저를 닫지 마세요. 분석이 끝나면 결과 화면으로 이동합니다.
          </p>
        </div>
      </div>
    </div>
  )
}
