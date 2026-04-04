/**
 * Supabase 테이블과 1:1에 가깝게 두는 저장용 타입(삽입/갱신 페이로드).
 * 실제 컬럼은 `supabase/migrations` SQL과 맞춥니다.
 */

import type { EvidenceStance } from "@/lib/ai/schema"

export type DocumentSourceKind = "pdf" | "text" | "pasted"

export type DocumentRowInsert = {
  content_hash: string
  source_kind: DocumentSourceKind
  title?: string | null
  /** STORE_DOCUMENT_SOURCE_TEXT=true 일 때만 채움 */
  raw_text?: string | null
  char_count: number
  meta?: Record<string, unknown> | null
}

export type DocumentChunkRowInsert = {
  document_id: string
  chunk_index: number
  content: string
  char_start?: number | null
  char_end?: number | null
  /** pgvector — 나중에 임베딩 파이프라인에서 채움 */
  embedding?: string | null
  meta?: Record<string, unknown> | null
}

export type AnalysisResultRowInsert = {
  document_id: string
  model_id: string
  raw_result: unknown
  provider_metadata?: unknown | null
  grounding_steps?: unknown | null
}

export type EvidenceRowInsert = {
  analysis_result_id: string
  issue_index: number
  evidence_index: number
  title: string
  url: string
  snippet: string
  stance: EvidenceStance
}
