import type { UReadyAppState, UReadySourceKind } from "./types"

export function createInitialUReadyState(): UReadyAppState {
  return {
    screen: "upload",
    draftText: "",
    selectedFile: null,
    sourceKind: "none",
    displayFilename: "분석 중...",
    analysisResult: null,
    analysisMaterialMeta: null,
    analysisError: null,
    extractingDocument: false,
  }
}

export function getDisplayFilename(
  draftText: string,
  file: File | null
): string {
  if (file) return file.name
  if (draftText.trim()) return "발표 대본 (직접 입력)"
  return "분석 중..."
}

export function resolveSourceKind(
  draftText: string,
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
  if (draftText.trim()) return "text"
  return "none"
}
