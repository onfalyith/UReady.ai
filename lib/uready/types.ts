/**
 * UReady 발표 검증 앱 — 화면·입력·상태 타입
 *
 * 상태 분리:
 * - `textareaDraft`: 발표 대본 입력란(직접 입력만 표시)
 * - `documentText`: 파일에서 읽은 본문(분석용, 입력란에 넣지 않음)
 * - `selectedFile`: 선택된 PDF/TXT
 * - `extractingDocument`: PDF 등 서버 추출 로딩
 * - `screen === "loading"`: `/api/analyze` 분석 로딩
 * - `analysisResult`: 분석 성공 시 구조화 JSON (없으면 null)
 * - `analysisError`: 분석 API 실패 메시지 (없으면 null)
 */

import type { AnalysisMaterialMeta } from "@/lib/ai/schema"
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
  /** 직접 입력란에만 표시되는 텍스트 */
  textareaDraft: string
  /** 파일에서 추출·읽은 본문(분석 시 파일이 있으면 이 값 사용) */
  documentText: string
  selectedFile: File | null
  sourceKind: UReadySourceKind
  /** 로딩/결과 상단에 표시할 라벨 */
  displayFilename: string
  /** 분석 API 성공 시에만 설정 */
  analysisResult: PresentationAnalysis | null
  /** 모델 입력 길이·잘림 여부(응답에 포함될 때만) */
  analysisMaterialMeta: AnalysisMaterialMeta | null
  /** 분석 API 실패 시 업로드 화면 등에 표시 */
  analysisError: string | null
  /** PDF 서버 추출 중 (업로드 화면) */
  extractingDocument: boolean
}
