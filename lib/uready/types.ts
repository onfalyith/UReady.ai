/**
 * UReady 발표 검증 앱 — 화면·입력·상태 타입
 *
 * 상태 분리:
 * - `draftText` / `selectedFile`: 업로드·입력 텍스트
 * - `extractingDocument`: PDF 등 서버 추출 로딩
 * - `screen === "loading"`: `/api/analyze` 분석 로딩
 * - `analysisResult`: 분석 성공 시 구조화 JSON (없으면 null)
 * - `analysisError`: 분석 API 실패 메시지 (없으면 null)
 */

import type { PresentationAnalysis } from "@/types/analysis"

/** 단일 페이지 내 3화면 전환 */
export type UReadyScreen = "upload" | "loading" | "result"

/** 사용자가 넣은 소스 종류 */
export type UReadySourceKind = "text" | "pdf" | "none"

/** 레거시 데모 카드 타입 — 필요 시 보존 */
export type RiskLevel = "high" | "medium" | "low"

export type UReadyIssue = {
  id: string
  risk: RiskLevel
  categoryLabel: string
  quote: string
  vulnerabilityText: string
  reason: string
  improvementQuestions: string[]
}

export type UReadyAppState = {
  screen: UReadyScreen
  /** 업로드 화면 텍스트 */
  draftText: string
  selectedFile: File | null
  sourceKind: UReadySourceKind
  /** 로딩/결과 상단에 표시할 라벨 */
  displayFilename: string
  /** 분석 API 성공 시에만 설정 */
  analysisResult: PresentationAnalysis | null
  /** 분석 API 실패 시 업로드 화면 등에 표시 */
  analysisError: string | null
  /** PDF 서버 추출 중 (업로드 화면) */
  extractingDocument: boolean
}
