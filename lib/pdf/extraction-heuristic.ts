/**
 * pdf.js 텍스트 레이어 추출 결과가 스캔본·레이아웃 이슈로 빈약한지 판단합니다.
 * Unstructured 등 2차 추출으로 넘길지 결정할 때 사용합니다.
 */
export type PdfJsExtractionMeta = {
  numPages: number
  pageCharCounts: number[]
}

/**
 * 슬라이드·요약 PDF는 페이지당 글자 수가 적어도 정상인 경우가 많습니다.
 * 예전 기준(평균 140자/페이지 등)은 발표 자료를 과도하게 Unstructured로 넘겨,
 * API 키가 없을 때 추출이 전부 실패하는 원인이 되었습니다.
 */
export function isPdfJsExtractionLowQuality(
  text: string,
  meta: PdfJsExtractionMeta
): boolean {
  const extractedChars = text.replace(/\s/g, "").length
  const { numPages, pageCharCounts } = meta

  if (!text.trim() || extractedChars < 25) return true

  const lowPages = pageCharCounts.filter((c) => c < 12).length
  const lowFrac = numPages > 0 ? lowPages / numPages : 0
  /** 대다수 페이지가 사실상 비어 있으면 스캔본 등으로 보고 2차 추출 시도 */
  if (numPages >= 2 && lowFrac >= 0.55) return true

  const avg = numPages > 0 ? extractedChars / numPages : 0
  /** 전체 글자는 있는데 페이지당 극단적으로 적고, 페이지 수가 많을 때만 의심 */
  if (numPages >= 5 && avg < 8 && extractedChars < 120) return true

  return false
}
