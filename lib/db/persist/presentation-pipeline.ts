/**
 * 분석·추출 성공 후 Supabase 정규화 저장 파이프라인.
 *
 * 고수준(클라이언트 자동 생성):
 * - `savePdfExtractionRecord` — 추출 API 성공 후
 * - `savePresentationAnalysisRecord` — 분석 API 성공 후
 *
 * 저수준(테스트·커스텀 흐름):
 * - `persistPresentationDocument` → `persistPresentationChunks` →
 *   `persistPresentationAnalysisResult` → `persistPresentationEvidences`
 */
export {
  persistPresentationAnalysisResult,
  persistPresentationChunks,
  persistPresentationDocument,
  persistPresentationEvidences,
  savePdfExtractionRecord,
  savePresentationAnalysisRecord,
  type SavePdfExtractionInput,
  type SavePresentationAnalysisInput,
} from "@/lib/db/repositories/presentation-storage"
