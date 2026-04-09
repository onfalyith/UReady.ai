import {
  countSignificantChars,
  MIN_ANALYSIS_SIGNIFICANT_CHARS,
} from "@/lib/uready/analysis-limits"
import type { UReadyAppState, UReadySourceKind } from "./types"

/** 분석 본문에 삽입 — 모델·UI가 구역을 구분하는 데 사용 */
export const DUAL_SCRIPT_SECTION = "=== 발표 대본 ==="
export const DUAL_MATERIAL_SECTION_PREFIX = "=== 발표 자료"

export function buildDualCombinedAnalysisText(
  scriptText: string,
  materialText: string,
  materialFilename: string
): string {
  const s = scriptText.trim()
  const m = materialText.trim()
  return `${DUAL_SCRIPT_SECTION}\n\n${s}\n\n${DUAL_MATERIAL_SECTION_PREFIX} (파일: ${materialFilename})\n\n${m}`
}

export function createInitialUReadyState(): UReadyAppState {
  return {
    screen: "upload",
    textareaDraft: "",
    documentText: "",
    selectedFile: null,
    sourceKind: "none",
    displayFilename: "분석 중...",
    analysisResult: null,
    analysisMaterialMeta: null,
    analysisError: null,
    extractingDocument: false,
    deepInspectionMode: false,
  }
}

/** 대본·파일 본문이 모두 채워진 경우(결과 화면 분리·결합 본문용) */
export function hasDualSourceFields(state: {
  selectedFile: File | null
  documentText: string
  textareaDraft: string
}): boolean {
  if (!state.selectedFile) return false
  return (
    state.textareaDraft.trim().length > 0 &&
    state.documentText.trim().length > 0
  )
}

/**
 * API·프롬프트에서 이중 입력(통합 검토)으로 보낼 만큼 충분한 분량인지
 * (최소 글자 규칙은 `startAnalysis`와 동일)
 */
export function isDualSourceInput(state: {
  selectedFile: File | null
  documentText: string
  textareaDraft: string
}): boolean {
  if (!hasDualSourceFields(state) || !state.selectedFile) return false
  const combined = buildDualCombinedAnalysisText(
    state.textareaDraft,
    state.documentText,
    state.selectedFile.name
  )
  return countSignificantChars(combined) >= MIN_ANALYSIS_SIGNIFICANT_CHARS
}

/** 분석 API에 넣을 본문 */
export function getAnalysisText(state: {
  selectedFile: File | null
  documentText: string
  textareaDraft: string
}): string {
  if (hasDualSourceFields(state) && state.selectedFile) {
    return buildDualCombinedAnalysisText(
      state.textareaDraft,
      state.documentText,
      state.selectedFile.name
    )
  }
  if (state.selectedFile && state.documentText.trim()) {
    return state.documentText
  }
  return state.textareaDraft
}

export function getDisplayFilename(
  textareaDraft: string,
  file: File | null
): string {
  if (file && textareaDraft.trim()) {
    return `발표 대본 + ${file.name}`
  }
  if (file) return file.name
  if (textareaDraft.trim()) return "발표 대본 (직접 입력)"
  return "분석 중..."
}

export function resolveSourceKind(
  analysisText: string,
  file: File | null
): UReadySourceKind {
  if (file) {
    const n = file.name.toLowerCase()
    if (
      file.type === "application/pdf" ||
      file.type === "application/x-pdf" ||
      n.endsWith(".pdf")
    ) {
      return "pdf"
    }
    return "text"
  }
  if (analysisText.trim()) return "text"
  return "none"
}
