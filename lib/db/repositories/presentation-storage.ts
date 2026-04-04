import "server-only"

import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PresentationAnalysis } from "@/lib/ai/schema"
import type { GroundingStepSnapshot } from "@/lib/ai/analyze"
import { getGeminiAnalysisModelId } from "@/lib/ai/gemini-model"
import { chunkPlainText } from "@/lib/db/chunk-text"
import { createServerSupabaseClient } from "@/lib/db/supabase"
import type { DocumentSourceKind } from "@/lib/db/types"

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

function storeRawText(): boolean {
  return (
    process.env.STORE_DOCUMENT_SOURCE_TEXT === "true" ||
    process.env.STORE_VERIFICATION_SOURCE_TEXT === "true"
  )
}

/**
 * ① 문서 저장 — 동일 `content_hash`면 갱신(메타·제목·옵션 raw_text).
 * 서비스 롤 클라이언트는 `createServerSupabaseClient()` 로 생성.
 */
export async function persistPresentationDocument(
  client: SupabaseClient,
  input: {
    text: string
    sourceKind: DocumentSourceKind
    title?: string | null
    meta?: Record<string, unknown> | null
  }
): Promise<string | null> {
  const hash = contentHash(input.text)
  const row: Record<string, unknown> = {
    content_hash: hash,
    source_kind: input.sourceKind,
    raw_text: storeRawText() ? input.text : null,
    char_count: input.text.length,
    meta: input.meta ?? {},
    updated_at: new Date().toISOString(),
  }
  if (input.title !== undefined) {
    row.title = input.title
  }

  const { data, error } = await client
    .from("documents")
    .upsert(row, { onConflict: "content_hash" })
    .select("id")
    .single()

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[presentation-storage] persistPresentationDocument:", error.message)
    }
    return null
  }
  return data?.id ?? null
}

/**
 * ② 청크 저장 — 해당 문서의 기존 `document_chunks` 삭제 후 재삽입.
 * `embedding` 은 null 로 두고, 추후 배치에서 `vector` 컬럼만 업데이트하면 됩니다.
 */
export async function persistPresentationChunks(
  client: SupabaseClient,
  documentId: string,
  fullText: string
): Promise<void> {
  const { error: delErr } = await client
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId)

  if (delErr && process.env.NODE_ENV === "development") {
    console.warn("[presentation-storage] delete chunks:", delErr.message)
    return
  }

  const parts = chunkPlainText(fullText)
  if (parts.length === 0) return

  const rows = parts.map((content, chunk_index) => ({
    document_id: documentId,
    chunk_index,
    content,
    char_start: null as number | null,
    char_end: null as number | null,
    meta: {},
  }))

  const { error: insErr } = await client.from("document_chunks").insert(rows)
  if (insErr && process.env.NODE_ENV === "development") {
    console.warn("[presentation-storage] insert chunks:", insErr.message)
  }
}

/** ③ 분석 결과 1건 저장 → `analysis_results.id` */
export async function persistPresentationAnalysisResult(
  client: SupabaseClient,
  input: {
    documentId: string
    rawResult: unknown
    providerMetadata?: unknown
    groundingSteps?: GroundingStepSnapshot[]
  }
): Promise<string | null> {
  const { data, error } = await client
    .from("analysis_results")
    .insert({
      document_id: input.documentId,
      model_id: getGeminiAnalysisModelId(),
      raw_result: input.rawResult,
      provider_metadata: input.providerMetadata ?? null,
      grounding_steps: input.groundingSteps ?? null,
    })
    .select("id")
    .single()

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[presentation-storage] analysis_results:", error.message)
    }
    return null
  }
  return data?.id ?? null
}

/** ④ 근거 행 일괄 저장 */
export async function persistPresentationEvidences(
  client: SupabaseClient,
  analysisResultId: string,
  analysis: PresentationAnalysis
): Promise<void> {
  const rows: {
    analysis_result_id: string
    issue_index: number
    evidence_index: number
    title: string
    url: string
    snippet: string
    stance: string
  }[] = []

  analysis.issues.forEach((issue, issueIndex) => {
    issue.evidence.forEach((ev, evidenceIndex) => {
      rows.push({
        analysis_result_id: analysisResultId,
        issue_index: issueIndex,
        evidence_index: evidenceIndex,
        title: ev.title,
        url: ev.url,
        snippet: ev.snippet,
        stance: ev.stance,
      })
    })
  })

  if (rows.length === 0) return

  const { error } = await client.from("evidences").insert(rows)
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[presentation-storage] evidences:", error.message)
  }
}

export type SavePdfExtractionInput = {
  text: string
  filename: string
  extractionSource: "pdfjs" | "unstructured"
  /** 예: IP 기반 fingerprint — documents.meta에만 저장 */
  clientIdentifier?: string
}

/**
 * PDF 추출 성공 후: documents + document_chunks 저장.
 * 테이블이 없거나 오류여도 API 응답에는 영향 없음.
 */
export async function savePdfExtractionRecord(
  input: SavePdfExtractionInput
): Promise<void> {
  const client = createServerSupabaseClient()
  if (!client) {
    if (process.env.NODE_ENV === "development") {
      console.info("[savePdfExtractionRecord] Supabase 미설정 — 저장 생략")
    }
    return
  }

  const documentId = await persistPresentationDocument(client, {
    text: input.text,
    sourceKind: "pdf",
    title: input.filename,
    meta: {
      extraction_source: input.extractionSource,
      client_identifier: input.clientIdentifier ?? null,
    },
  })

  if (!documentId) return
  await persistPresentationChunks(client, documentId, input.text)
}

export type SavePresentationAnalysisInput = {
  sourceText: string
  sourceKind: DocumentSourceKind
  title?: string | null
  analysis: PresentationAnalysis
  providerMetadata?: unknown
  groundingSteps?: GroundingStepSnapshot[]
  clientIdentifier?: string
}

/**
 * 분석 성공 후: 문서 → 청크 → analysis_results → evidences 순 저장.
 */
export async function savePresentationAnalysisRecord(
  input: SavePresentationAnalysisInput
): Promise<void> {
  const client = createServerSupabaseClient()
  if (!client) {
    if (process.env.NODE_ENV === "development") {
      console.info("[savePresentationAnalysisRecord] Supabase 미설정 — 저장 생략")
    }
    return
  }

  const documentId = await persistPresentationDocument(client, {
    text: input.sourceText,
    sourceKind: input.sourceKind,
    title: input.title ?? null,
    meta: {
      client_identifier: input.clientIdentifier ?? null,
    },
  })

  if (!documentId) return

  await persistPresentationChunks(client, documentId, input.sourceText)

  const analysisId = await persistPresentationAnalysisResult(client, {
    documentId,
    rawResult: input.analysis,
    providerMetadata: input.providerMetadata,
    groundingSteps: input.groundingSteps,
  })

  if (!analysisId) return
  await persistPresentationEvidences(client, analysisId, input.analysis)
}
